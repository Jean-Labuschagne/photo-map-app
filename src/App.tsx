import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Map from './components/Map';
import AlbumGrid from './components/AlbumGrid';
import Slideshow from './components/Slideshow';
import OptionCard from './components/OptionCard';
import AddPinModal from './components/AddPinModal';
import SpotifyPanel from './components/SpotifyPanel';
import { MapPin, Image, Play, Plus, X } from 'lucide-react';
import { onAuthStateChanged, signInWithEmailAndPassword, type User, signOut } from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { auth, db, storage, storageFallback, STORAGE_BUCKET_CANDIDATES } from './lib/firebase';
import './App.css';

export interface PhotoPin {
  id: string;
  lat: number;
  lng: number;
  name: string;
  subtitle: string;
  photoCount: number;
  thumbnail: string;
  photos: string[];
  song?: {
    id: string;
    title: string;
    artist: string;
    previewUrl: string | null;
    spotifyUrl: string;
    startTime: number;
  };
}

export interface UploadItemProgress {
  id: string;
  pinId: string;
  name: string;
  progress: number;
  stage: 'queued' | 'compressing' | 'uploading' | 'saving' | 'done' | 'error';
  error?: string;
  finishedAt?: number;
}

export interface OptimisticPhotoPreview {
  id: string;
  pinId: string;
  name: string;
  tempUrl: string;
  displayUrl: string;
  remoteUrl?: string;
  status: 'uploading' | 'saved' | 'failed' | 'cancelled';
}

export interface UploadBatchSummary {
  total: number;
  succeeded: number;
  failed: number;
  completed: boolean;
}

const ALLOWED_EMAILS = new Set([
  'jeanlabus.jl65@gmail.com',
  'ankesmith0@gmail.com',
]);
const DIAGNOSTICS_EMAIL = 'jeanlabus.jl65@gmail.com';

const getFallbackThumbnail = (seed: string) => `https://picsum.photos/seed/${seed}/200/200`;
const SMALL_IMAGE_THRESHOLD_BYTES = 200 * 1024;
const MAX_IMAGE_DIMENSION = 1600;
const COMPLETED_UPLOAD_RETENTION_MS = 4000;
const FIRESTORE_WRITE_TIMEOUT_MS = 45000;

type UploadQueueItem = {
  itemId: string;
  pinId: string;
  name: string;
  file: File;
  originalIndex: number;
};

type AsyncQueue<T> = {
  push: (item: T) => void;
  shift: () => Promise<T | undefined>;
  close: () => void;
};

const createAsyncQueue = <T,>(): AsyncQueue<T> => {
  const items: T[] = [];
  const waiters: Array<(value: T | undefined) => void> = [];
  let isClosed = false;

  return {
    push(item: T) {
      if (isClosed) {
        return;
      }
      const waiter = waiters.shift();
      if (waiter) {
        waiter(item);
        return;
      }
      items.push(item);
    },
    shift() {
      if (items.length > 0) {
        return Promise.resolve(items.shift());
      }
      if (isClosed) {
        return Promise.resolve(undefined);
      }

      return new Promise<T | undefined>((resolve) => {
        waiters.push(resolve);
      });
    },
    close() {
      isClosed = true;
      while (waiters.length > 0) {
        const waiter = waiters.shift();
        waiter?.(undefined);
      }
    },
  };
};

const yieldToMainThread = async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

const getAdaptiveWebpQuality = (fileSizeBytes: number) => {
  const sizeMb = fileSizeBytes / (1024 * 1024);
  if (sizeMb < 2) {
    return 0.8;
  }
  if (sizeMb <= 5) {
    return 0.7;
  }
  return 0.6;
};

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null) {
    const maybeCode = (error as { code?: string }).code;
    const maybeMessage = (error as { message?: string }).message;
    if (maybeCode && maybeMessage) {
      return `${maybeCode}: ${maybeMessage}`;
    }
    if (maybeMessage) {
      return maybeMessage;
    }
  }
  return 'Unknown error';
};

const fileNameToWebp = (fileName: string) => {
  const lastDot = fileName.lastIndexOf('.');
  const baseName = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
  return `${baseName}.webp`;
};

const loadImageElement = (file: File): Promise<HTMLImageElement> => {
  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not decode image in browser.'));
    };
    image.src = objectUrl;
  });
};

export const compressAndResizeImage = async (file: File): Promise<File> => {
  const mimeType = (file.type || '').toLowerCase();
  const isHeicLike = mimeType.includes('heic') || mimeType.includes('heif');

  if (file.size <= SMALL_IMAGE_THRESHOLD_BYTES && !isHeicLike) {
    return file;
  }

  const image = await loadImageElement(file);
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = longestSide > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / longestSide : 1;
  const targetWidth = Math.max(1, Math.round(image.naturalWidth * scale));
  const targetHeight = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas rendering context is unavailable.');
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const quality = getAdaptiveWebpQuality(file.size);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), 'image/webp', quality);
  });

  if (!blob) {
    throw new Error('Image compression failed to produce output.');
  }

  if (blob.size >= file.size && !isHeicLike) {
    return file;
  }

  return new File([blob], fileNameToWebp(file.name), {
    type: 'image/webp',
    lastModified: Date.now(),
  });
};

const uploadBytesWithTimeout = async (
  storageRef: ReturnType<typeof ref>,
  file: File,
  onProgress?: (progress: number) => void,
  timeoutMs = 45000,
  onTaskReady?: (task: ReturnType<typeof uploadBytesResumable>) => void
) => {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const uploadTask = uploadBytesResumable(storageRef, file);
  onTaskReady?.(uploadTask);

  try {
    const uploadPromise = new Promise<void>((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          onProgress?.(progress);
        },
        (error) => reject(error),
        () => resolve()
      );
    });

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        uploadTask.cancel();
        reject(new Error('Upload timed out while waiting for storage response.'));
      }, timeoutMs);
    });

    await Promise.race([uploadPromise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const getUploadTimeoutMs = (file: File) => {
  const sizeMb = file.size / (1024 * 1024);
  const perMbMs = 12000;
  const baseMs = 30000;
  const computed = Math.round(baseMs + sizeMb * perMbMs);
  return Math.min(Math.max(computed, 30000), 180000);
};

async function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = 12000): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`${label} timed out. Please try again.`));
      }, timeoutMs);
    });

    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

const uploadPinImage = async (
  pinId: string,
  file: File,
  prefix: 'thumb' | 'photo',
  onProgress?: (progress: number) => void,
  onTaskReady?: (task: ReturnType<typeof uploadBytesResumable>) => void
) => {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const objectPath = `pins/${pinId}/${prefix}-${Date.now()}-${safeName}`;

  const candidates = storageFallback ? [storage, storageFallback] : [storage];
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      const candidateRef = ref(candidate, objectPath);
      await uploadBytesWithTimeout(candidateRef, file, onProgress, getUploadTimeoutMs(file), onTaskReady);
      return getDownloadURL(candidateRef);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    const bucketNames = STORAGE_BUCKET_CANDIDATES.join(', ');
    throw new Error(`${getErrorMessage(lastError)} (Buckets tried: ${bucketNames})`);
  }

  throw new Error('No storage bucket candidates available.');
};

function App() {
  const [pins, setPins] = useState<PhotoPin[]>([]);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [showAlbum, setShowAlbum] = useState(false);
  const [showSlideshow, setShowSlideshow] = useState(false);
  const [showSpotifyPanel, setShowSpotifyPanel] = useState(false);
  const [isAddingPin, setIsAddingPin] = useState(false);
  const [showAddPinModal, setShowAddPinModal] = useState(false);
  const [newPinLocation, setNewPinLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [appError, setAppError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [syncProgress, setSyncProgress] = useState<number | null>(null);
  const [syncMessage, setSyncMessage] = useState('Syncing...');
  const [firestoreHealth, setFirestoreHealth] = useState<'unknown' | 'ok' | 'failed'>('unknown');
  const [firestoreHealthMessage, setFirestoreHealthMessage] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(true);
  const [lastFirestoreError, setLastFirestoreError] = useState<string | null>(null);
  const [lastStorageError, setLastStorageError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState('idle');
  const [lastActionAt, setLastActionAt] = useState<string | null>(null);
  const [uploadItems, setUploadItems] = useState<UploadItemProgress[]>([]);
  const [optimisticPhotos, setOptimisticPhotos] = useState<OptimisticPhotoPreview[]>([]);
  const [uploadSummaryByPin, setUploadSummaryByPin] = useState<Record<string, UploadBatchSummary>>({});
  const activeUploadTasksRef = useRef<globalThis.Map<string, ReturnType<typeof uploadBytesResumable>>>(new globalThis.Map());
  const cancelledUploadIdsRef = useRef<Set<string>>(new Set());
  const uploadSourceFilesRef = useRef<globalThis.Map<string, File>>(new globalThis.Map());
  const optimisticPhotosRef = useRef<OptimisticPhotoPreview[]>([]);

  const markAction = useCallback((action: string) => {
    setLastAction(action);
    setLastActionAt(new Date().toISOString());
  }, []);

  const selectedPin = useMemo(
    () => pins.find((pin) => pin.id === selectedPinId) || null,
    [pins, selectedPinId]
  );
  const canViewDiagnostics = user?.email === DIAGNOSTICS_EMAIL;

  const selectedPinUploads = useMemo(() => {
    if (!selectedPinId) {
      return [] as UploadItemProgress[];
    }
    return uploadItems.filter((item) => item.pinId === selectedPinId);
  }, [uploadItems, selectedPinId]);

  const selectedPinOptimisticPhotos = useMemo(() => {
    if (!selectedPinId) {
      return [] as OptimisticPhotoPreview[];
    }
    return optimisticPhotos.filter((item) => item.pinId === selectedPinId);
  }, [optimisticPhotos, selectedPinId]);

  const selectedPinBatchSummary = useMemo(() => {
    if (!selectedPinId) {
      return null;
    }
    return uploadSummaryByPin[selectedPinId] || null;
  }, [selectedPinId, uploadSummaryByPin]);

  const selectedPinUploadSummary = useMemo(() => {
    const total = Math.max(selectedPinUploads.length, selectedPinBatchSummary?.total || 0);
    const completed = selectedPinUploads.filter((item) => item.stage === 'done' || item.stage === 'error').length;
    const active = selectedPinUploads.filter((item) => item.stage !== 'done' && item.stage !== 'error').length;
    const averageProgress = active > 0
      ? Math.round(
          selectedPinUploads
            .filter((item) => item.stage !== 'done' && item.stage !== 'error')
            .reduce((sum, item) => sum + item.progress, 0) / active
        )
      : null;

    return {
      total,
      completed,
      active,
      averageProgress,
      label: active > 0
        ? `Uploading ${Math.min(completed + 1, total)} of ${total}`
        : selectedPinBatchSummary?.completed
          ? `${selectedPinBatchSummary.succeeded} uploaded, ${selectedPinBatchSummary.failed} failed`
          : null,
    };
  }, [selectedPinBatchSummary, selectedPinUploads]);

  const updateUploadItem = useCallback((id: string, patch: Partial<UploadItemProgress>) => {
    setUploadItems((previous) => previous.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const isUploadCancelled = useCallback((itemId: string) => {
    return cancelledUploadIdsRef.current.has(itemId);
  }, []);

  const markUploadFailure = useCallback((itemId: string, message: string) => {
    const isCancelled = message.toLowerCase().includes('cancel');
    updateUploadItem(itemId, {
      stage: 'error',
      error: message,
      finishedAt: Date.now(),
    });
    setOptimisticPhotos((previous) => previous.map((photo) => (
      photo.id === itemId
        ? { ...photo, status: isCancelled ? 'cancelled' : 'failed' }
        : photo
    )));
  }, [updateUploadItem]);

  const handleCancelUploadItem = useCallback((itemId: string) => {
    cancelledUploadIdsRef.current.add(itemId);
    const activeTask = activeUploadTasksRef.current.get(itemId);
    if (activeTask) {
      activeTask.cancel();
    }
    markUploadFailure(itemId, 'Upload cancelled by user.');
  }, [markUploadFailure]);

  const uploadSingleImage = useCallback(async (
    pinId: string,
    file: File,
    prefix: 'thumb' | 'photo',
    onProgress?: (progress: number) => void,
    itemId?: string
  ) => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (itemId && isUploadCancelled(itemId)) {
        throw new Error('Upload cancelled by user.');
      }
      try {
        return await uploadPinImage(pinId, file, prefix, onProgress, (task) => {
          if (itemId) {
            activeUploadTasksRef.current.set(itemId, task);
          }
        });
      } catch (error) {
        lastError = error;
      } finally {
        if (itemId) {
          activeUploadTasksRef.current.delete(itemId);
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(getErrorMessage(lastError));
  }, [isUploadCancelled]);

  const appendPhotosToPinSafely = useCallback(async (pinId: string, photoUrls: string[]) => {
    if (photoUrls.length === 0) {
      return;
    }

    const pinRef = doc(db, 'pins', pinId);

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(pinRef);
      if (!snapshot.exists()) {
        throw new Error('Pin does not exist anymore.');
      }

      const data = snapshot.data() as { photos?: string[]; thumbnail?: string };
      const currentPhotos = Array.isArray(data.photos) ? data.photos : [];
      const mergedPhotos = [...currentPhotos];
      for (const url of photoUrls) {
        if (!mergedPhotos.includes(url)) {
          mergedPhotos.push(url);
        }
      }

      if (mergedPhotos.length === currentPhotos.length) {
        return;
      }

      transaction.update(pinRef, {
        photos: mergedPhotos,
        photoCount: mergedPhotos.length,
        thumbnail: data.thumbnail || mergedPhotos[0] || getFallbackThumbnail(pinId),
        updatedAt: serverTimestamp(),
      });
    });
  }, []);

  const processAndUploadImage = useCallback(async (input: UploadQueueItem) => {
    try {
      if (isUploadCancelled(input.itemId)) {
        markUploadFailure(input.itemId, 'Upload cancelled by user.');
        return null;
      }

      updateUploadItem(input.itemId, { stage: 'uploading', progress: 20 });

      const photoUrl = await uploadSingleImage(input.pinId, input.file, 'photo', (progress) => {
        const boundedProgress = Math.min(95, Math.max(20, Math.round(20 + (progress * 0.75))));
        updateUploadItem(input.itemId, { stage: 'uploading', progress: boundedProgress });
      }, input.itemId);

      updateUploadItem(input.itemId, { stage: 'saving', progress: 100 });
      return {
        itemId: input.itemId,
        photoUrl,
      };
    } catch (error) {
      const message = getErrorMessage(error);
      markUploadFailure(input.itemId, message);

      if (message.toLowerCase().includes('upload') || message.toLowerCase().includes('storage')) {
        setLastStorageError(message);
      }
      if (message.toLowerCase().includes('saving') || message.toLowerCase().includes('firestore')) {
        setLastFirestoreError(message);
      }
      setAppError(`Photo upload failed for ${input.name}. ${message}`);
      return null;
    }
  }, [isUploadCancelled, markUploadFailure, updateUploadItem, uploadSingleImage]);

  const uploadQueue = useCallback(async (
    pinId: string,
    files: File[],
    uploadConcurrency = 3,
    compressionConcurrency = 4
  ) => {
    const imageFiles = files
      .map((file, index) => ({ file, index }))
      .filter((item) => item.file.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      return;
    }

    markAction('add-photo:start');
    setAppError(null);

    const startedAt = Date.now();
    const prioritized = [...imageFiles].sort((a, b) => a.index - b.index);
    const queueItems: UploadQueueItem[] = prioritized.map((item, index) => ({
      itemId: `${pinId}-${startedAt}-${index}`,
      pinId,
      name: item.file.name,
      file: item.file,
      originalIndex: item.index,
    }));

    const progressItems: UploadItemProgress[] = queueItems.map((item) => ({
      id: item.itemId,
      pinId: item.pinId,
      name: item.name,
      progress: 0,
      stage: 'queued',
    }));

    const optimisticEntries: OptimisticPhotoPreview[] = queueItems.map((item) => {
      const tempUrl = URL.createObjectURL(item.file);
      return {
        id: item.itemId,
        pinId: item.pinId,
        name: item.name,
        tempUrl,
        displayUrl: tempUrl,
        status: 'uploading',
      };
    });

    for (const item of queueItems) {
      cancelledUploadIdsRef.current.delete(item.itemId);
      uploadSourceFilesRef.current.set(item.itemId, item.file);
    }

    setUploadItems((previous) => [
      ...previous.filter((item) => item.pinId !== pinId),
      ...progressItems,
    ]);

    setOptimisticPhotos((previous) => [
      ...previous.filter((item) => item.pinId !== pinId || (item.status !== 'saved' && item.status !== 'uploading')),
      ...optimisticEntries,
    ]);

    setUploadSummaryByPin((previous) => ({
      ...previous,
      [pinId]: {
        total: queueItems.length,
        succeeded: 0,
        failed: 0,
        completed: false,
      },
    }));

    const uploadReadyQueue = createAsyncQueue<UploadQueueItem>();
    const successfulUploads: Array<{ itemId: string; photoUrl: string }> = [];
    let compressionFailures = 0;
    let uploadFailures = 0;

    const compressionPending = [...queueItems];
    const compressionWorkers = Array.from(
      { length: Math.min(Math.max(compressionConcurrency, 1), compressionPending.length) },
      async () => {
        while (true) {
          const next = compressionPending.shift();
          if (!next) {
            return;
          }

          if (isUploadCancelled(next.itemId)) {
            compressionFailures += 1;
            markUploadFailure(next.itemId, 'Upload cancelled by user.');
            continue;
          }

          updateUploadItem(next.itemId, { stage: 'compressing', progress: 5 });
          await yieldToMainThread();

          try {
            const optimized = await compressAndResizeImage(next.file);
            if (isUploadCancelled(next.itemId)) {
              compressionFailures += 1;
              markUploadFailure(next.itemId, 'Upload cancelled by user.');
              continue;
            }

            updateUploadItem(next.itemId, { stage: 'queued', progress: 15 });
            uploadReadyQueue.push({ ...next, file: optimized });
          } catch (error) {
            compressionFailures += 1;
            markUploadFailure(next.itemId, getErrorMessage(error));
          }
        }
      }
    );

    const uploadWorkers = Array.from(
      { length: Math.min(Math.max(uploadConcurrency, 1), queueItems.length) },
      async () => {
        while (true) {
          const nextUpload = await uploadReadyQueue.shift();
          if (!nextUpload) {
            return;
          }

          const result = await processAndUploadImage(nextUpload);
          if (result) {
            successfulUploads.push(result);
          } else {
            uploadFailures += 1;
          }
        }
      }
    );

    await Promise.all(compressionWorkers);
    uploadReadyQueue.close();
    await Promise.all(uploadWorkers);

    let committedUploads = successfulUploads;
    if (successfulUploads.length > 0) {
      try {
        await withTimeout(
          appendPhotosToPinSafely(pinId, successfulUploads.map((upload) => upload.photoUrl)),
          'Saving batch photo metadata',
          FIRESTORE_WRITE_TIMEOUT_MS
        );
      } catch (error) {
        const metadataError = getErrorMessage(error);
        setLastFirestoreError(metadataError);
        setAppError(`Batch metadata save failed. ${metadataError}`);
        for (const upload of successfulUploads) {
          markUploadFailure(upload.itemId, `Metadata save failed: ${metadataError}`);
        }
        committedUploads = [];
      }
    }

    if (committedUploads.length > 0) {
      const completedAt = Date.now();
      const successMap = new globalThis.Map(committedUploads.map((upload) => [upload.itemId, upload.photoUrl]));

      for (const upload of committedUploads) {
        uploadSourceFilesRef.current.delete(upload.itemId);
        updateUploadItem(upload.itemId, {
          stage: 'done',
          progress: 100,
          finishedAt: completedAt,
        });
      }

      setOptimisticPhotos((previous) => previous.map((photo) => {
        const remoteUrl = successMap.get(photo.id);
        if (!remoteUrl || photo.status === 'saved') {
          return photo;
        }
        URL.revokeObjectURL(photo.tempUrl);
        return {
          ...photo,
          status: 'saved',
          displayUrl: remoteUrl,
          remoteUrl,
        };
      }));
    }

    const succeededCount = committedUploads.length;
    const failedCount = queueItems.length - succeededCount;

    setUploadSummaryByPin((previous) => ({
      ...previous,
      [pinId]: {
        total: queueItems.length,
        succeeded: succeededCount,
        failed: failedCount,
        completed: true,
      },
    }));

    const hasErrors = compressionFailures + uploadFailures > 0 || failedCount > 0;
    markAction(hasErrors ? 'add-photo:failed' : 'add-photo:success');
  }, [appendPhotosToPinSafely, isUploadCancelled, markUploadFailure, markAction, processAndUploadImage, updateUploadItem]);

  useEffect(() => {
    if (!uploadItems.some((item) => item.stage === 'done')) {
      return;
    }

    const timeoutHandle = setTimeout(() => {
      const now = Date.now();
      setUploadItems((previous) =>
        previous.filter(
          (item) => item.stage !== 'done' || !item.finishedAt || now - item.finishedAt < COMPLETED_UPLOAD_RETENTION_MS
        )
      );
    }, 1000);

    return () => clearTimeout(timeoutHandle);
  }, [uploadItems]);

  useEffect(() => {
    optimisticPhotosRef.current = optimisticPhotos;
  }, [optimisticPhotos]);

  useEffect(() => {
    setOptimisticPhotos((previous) => previous.filter((entry) => {
      if (entry.status !== 'saved' || !entry.remoteUrl) {
        return true;
      }
      const pin = pins.find((candidate) => candidate.id === entry.pinId);
      if (!pin) {
        return true;
      }
      return !pin.photos.includes(entry.remoteUrl);
    }));
  }, [pins]);

  useEffect(() => {
    return () => {
      for (const preview of optimisticPhotosRef.current) {
        URL.revokeObjectURL(preview.tempUrl);
      }
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (nextUser && nextUser.email && !ALLOWED_EMAILS.has(nextUser.email)) {
        await signOut(auth);
        setUser(null);
        setAuthError('This account is not authorized for this app.');
        setAuthReady(true);
        return;
      }

      setUser(nextUser);
      setAuthReady(true);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      setPins([]);
      setSelectedPinId(null);
      setFirestoreHealth('unknown');
      setFirestoreHealthMessage(null);
      return;
    }

    withTimeout(
      getDocs(query(collection(db, 'pins'), limit(1))),
      'Firestore health check',
      10000
    )
      .then(() => {
        setFirestoreHealth('ok');
        setFirestoreHealthMessage(null);
      })
      .catch((error) => {
        setFirestoreHealth('failed');
        setLastFirestoreError(getErrorMessage(error));
        setFirestoreHealthMessage(
          `Firestore connection issue: ${getErrorMessage(error)}. Check Vercel Firebase env vars and Firestore initialization for ${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'unknown-project'}.`
        );
      });

    const pinsQuery = query(collection(db, 'pins'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      pinsQuery,
      (snapshot) => {
        const nextPins: PhotoPin[] = snapshot.docs.map((pinDoc) => {
          const data = pinDoc.data() as any;
          const photos = Array.isArray(data.photos) ? data.photos : [];
          const fallbackThumbnail = getFallbackThumbnail(pinDoc.id);

          return {
            id: pinDoc.id,
            lat: Number(data.lat || 0),
            lng: Number(data.lng || 0),
            name: data.name || 'Untitled',
            subtitle: data.subtitle || 'New Location',
            photoCount: Number(data.photoCount || photos.length || 0),
            thumbnail: data.thumbnail || photos[0] || fallbackThumbnail,
            photos,
            song: data.song || undefined,
          };
        });

        setPins(nextPins);

        if (selectedPinId && !nextPins.find((pin) => pin.id === selectedPinId)) {
          setSelectedPinId(null);
          setShowAlbum(false);
          setShowSlideshow(false);
        }
      },
      (error) => {
        setFirestoreHealth('failed');
        setLastFirestoreError(getErrorMessage(error));
        setFirestoreHealthMessage(`Firestore live sync failed: ${getErrorMessage(error)}`);
        setAppError('Unable to load locations from Firebase. Check Firestore rules and indexes.');
      }
    );

    return unsubscribe;
  }, [user, selectedPinId]);

  const handleSignIn = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setPassword('');
    } catch {
      setAuthError('Sign-in failed. Check your email and password.');
    }
  }, [email, password]);

  const handlePinClick = useCallback((pin: PhotoPin) => {
    setSelectedPinId(pin.id);
    setShowAlbum(false);
    setShowSlideshow(false);
  }, []);

  const handleViewAlbum = useCallback(() => {
    if (isSaving) {
      setAppError('Please wait for sync to finish before changing views.');
      return;
    }
    setShowAlbum(true);
    setShowSlideshow(false);
  }, [isSaving]);

  const handlePlaySlideshow = useCallback(() => {
    if (isSaving) {
      setAppError('Please wait for sync to finish before changing views.');
      return;
    }
    setShowSlideshow(true);
    setShowAlbum(false);
  }, [isSaving]);

  const handleCloseAlbum = useCallback(() => {
    if (isSaving) {
      setAppError('Sync in progress. Please wait for upload to finish before closing the album.');
      return;
    }
    setShowAlbum(false);
  }, [isSaving]);

  const handleCloseSlideshow = useCallback(() => {
    setShowSlideshow(false);
  }, []);

  const handleAddSong = useCallback(() => {
    setShowSpotifyPanel(true);
  }, []);

  const handleSongSelect = useCallback((song: { id: string; title: string; artist: string; previewUrl: string | null; spotifyUrl: string; startTime: number }) => {
    if (!selectedPinId) return;

    withTimeout(
      updateDoc(doc(db, 'pins', selectedPinId), {
        song,
        updatedAt: serverTimestamp(),
      }),
      'Saving song',
      FIRESTORE_WRITE_TIMEOUT_MS
    ).catch((error) => {
      setLastFirestoreError(getErrorMessage(error));
      setAppError(`Failed to save song. ${getErrorMessage(error)}`);
    });

    setShowSpotifyPanel(false);
  }, [selectedPinId]);

  const handleAddPinClick = useCallback(() => {
    if (isSaving) {
      setAppError('Please wait for current sync to finish.');
      return;
    }
    setIsAddingPin(true);
    setSelectedPinId(null);
    setShowAlbum(false);
    setShowSlideshow(false);
  }, [isSaving]);

  const handleMapClick = useCallback((lng: number, lat: number) => {
    if (isAddingPin) {
      setNewPinLocation({ lat, lng });
      setShowAddPinModal(true);
      setIsAddingPin(false);
    }
  }, [isAddingPin]);

  const handleAddPin = useCallback(async (pinInput: {
    lat: number;
    lng: number;
    name: string;
    subtitle: string;
    thumbnailFile: File | null;
  }) => {
    if (!user) return;

    setIsSaving(true);
    setSyncMessage('Saving location...');
    setSyncProgress(null);
    setAppError(null);
    markAction('add-pin:start');

    try {
      const pinRef = doc(collection(db, 'pins'));
      const fallbackThumbnail = getFallbackThumbnail(pinRef.id);
      let thumbnail = fallbackThumbnail;
      const photos: string[] = [];

      if (pinInput.thumbnailFile) {
        setSyncMessage('Uploading thumbnail...');
        const optimizedThumbnail = await compressAndResizeImage(pinInput.thumbnailFile);
        const thumbUrl = await uploadSingleImage(pinRef.id, optimizedThumbnail, 'thumb', setSyncProgress);
        thumbnail = thumbUrl;
        photos.push(thumbUrl);
      }

      setSyncMessage('Saving pin metadata...');
      await withTimeout(
        setDoc(pinRef, {
          lat: pinInput.lat,
          lng: pinInput.lng,
          name: pinInput.name,
          subtitle: pinInput.subtitle,
          photoCount: photos.length,
          thumbnail,
          photos,
          song: null,
          createdBy: user.email || 'unknown',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        'Saving pin data',
        FIRESTORE_WRITE_TIMEOUT_MS
      );

      setSelectedPinId(pinRef.id);
      setShowAddPinModal(false);
      setNewPinLocation(null);
      markAction('add-pin:success');
    } catch (error) {
      const message = getErrorMessage(error);
      if (message.toLowerCase().includes('upload') || message.toLowerCase().includes('storage')) {
        setLastStorageError(message);
      }
      if (message.toLowerCase().includes('saving pin data') || message.toLowerCase().includes('firestore')) {
        setLastFirestoreError(message);
      }
      setAppError(`Failed to add location. ${getErrorMessage(error)}`);
      markAction('add-pin:failed');
    } finally {
      setIsSaving(false);
      setSyncProgress(null);
    }
  }, [user]);

  const handleCancelAddPin = useCallback(() => {
    setShowAddPinModal(false);
    setNewPinLocation(null);
    setIsAddingPin(false);
  }, []);

  const handleAddPhotos = useCallback(async (pinId: string, files: File[]) => {
    await uploadQueue(pinId, files, 3, 4);
  }, [uploadQueue]);

  const handleRetryFailedUploads = useCallback(async (pinId: string) => {
    const failedItemIds = uploadItems
      .filter((item) => item.pinId === pinId && item.stage === 'error')
      .map((item) => item.id);

    const retryFiles = failedItemIds
      .map((id) => uploadSourceFilesRef.current.get(id))
      .filter((file): file is File => Boolean(file));

    if (retryFiles.length === 0) {
      setAppError('No failed files are available to retry. Please reselect images.');
      return;
    }

    await uploadQueue(pinId, retryFiles, 3, 4);
  }, [uploadItems, uploadQueue]);

  const handleRemovePhoto = useCallback(async (pinId: string, photoIndex: number) => {
    const pin = pins.find((item) => item.id === pinId);
    if (!pin) return;

    const removedPhotoUrl = pin.photos[photoIndex];
    const nextPhotos = pin.photos.filter((_, index) => index !== photoIndex);

    setIsSaving(true);
    setAppError(null);
    markAction('remove-photo:start');

    try {
      await withTimeout(
        updateDoc(doc(db, 'pins', pinId), {
          photos: nextPhotos,
          photoCount: nextPhotos.length,
          thumbnail: nextPhotos[0] || getFallbackThumbnail(pinId),
          updatedAt: serverTimestamp(),
        }),
        'Removing photo metadata',
        FIRESTORE_WRITE_TIMEOUT_MS
      );

      if (removedPhotoUrl?.includes('firebasestorage.googleapis.com')) {
        try {
          await deleteObject(ref(storage, removedPhotoUrl));
        } catch {
          // Ignore storage delete failures after Firestore update succeeds.
        }
      }
      markAction('remove-photo:success');
    } catch (error) {
      setLastFirestoreError(getErrorMessage(error));
      setAppError(`Failed to remove photo. ${getErrorMessage(error)}`);
      markAction('remove-photo:failed');
    } finally {
      setIsSaving(false);
    }
  }, [pins, markAction]);

  const handleBackToMap = useCallback(() => {
    if (isSaving) {
      setAppError('Sync in progress. Please wait before leaving this view.');
      return;
    }
    setSelectedPinId(null);
    setShowAlbum(false);
    setShowSlideshow(false);
  }, [isSaving]);

  if (!authReady) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1>PhotoGlobe</h1>
          <p>Preparing your private album...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-screen">
        <form className="auth-card" onSubmit={handleSignIn}>
          <h1>PhotoGlobe</h1>
          <p>Sign in to your shared album.</p>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {authError && <p className="auth-error">{authError}</p>}
          <button type="submit">Sign In</button>
        </form>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Grain overlay */}
      <div className="grain-overlay" />
      
      {/* Navigation */}
      <nav className="nav">
        <div className="nav-logo">
          <MapPin className="nav-logo-icon" />
          <span>PhotoGlobe</span>
        </div>
        <div className="session-debug">{(user.email || 'unknown')} · {import.meta.env.VITE_FIREBASE_PROJECT_ID || 'no-project-id'}</div>
        {isSaving && (
          <div className="save-indicator">
            <span>{syncMessage} {syncProgress !== null ? `${syncProgress}%` : ''}</span>
            {syncProgress !== null && (
              <div className="save-progress-track">
                <div className="save-progress-fill" style={{ width: `${syncProgress}%` }} />
              </div>
            )}
          </div>
        )}
        <div className="nav-links">
          <button onClick={handleBackToMap} className={!selectedPin && !showAlbum && !showSlideshow ? 'active' : ''}>
            <MapPin size={16} />
            Map
          </button>
          <button 
            onClick={() => selectedPin && handleViewAlbum()} 
            className={showAlbum ? 'active' : ''}
            disabled={!selectedPin}
          >
            <Image size={16} />
            Album
          </button>
          <button 
            onClick={() => selectedPin && handlePlaySlideshow()}
            className={showSlideshow ? 'active' : ''}
            disabled={!selectedPin}
          >
            <Play size={16} />
            Movie
          </button>
          {canViewDiagnostics && (
            <button
              onClick={() => setShowDiagnostics((value) => !value)}
              className={showDiagnostics ? 'active' : ''}
            >
              Diagnostics
            </button>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="main-content">
        {firestoreHealth === 'failed' && firestoreHealthMessage && (
          <div className="app-error-banner">{firestoreHealthMessage}</div>
        )}
        {appError && <div className="app-error-banner">{appError}</div>}
        {/* Map View */}
        {!showAlbum && !showSlideshow && (
          <div className="map-view">
            <Map 
              pins={pins}
              onPinClick={handlePinClick}
              selectedPin={selectedPin}
              isAddingPin={isAddingPin}
              onMapClick={handleMapClick}
            />

            {/* Add Location Button */}
            <button 
              className={`add-location-btn ${isAddingPin ? 'active' : ''}`}
              onClick={isAddingPin ? () => setIsAddingPin(false) : handleAddPinClick}
            >
              {isAddingPin ? <X size={20} /> : <Plus size={20} />}
              {isAddingPin ? 'Cancel' : 'Add Location'}
            </button>

            {/* Adding Pin Hint */}
            {isAddingPin && (
              <div className="adding-pin-hint">
                Click anywhere on the map to place a pin
              </div>
            )}

            {/* Option Card for Selected Pin */}
            {selectedPin && !isAddingPin && (
              <div className="option-card-container">
                <OptionCard
                  pin={selectedPin}
                  onViewAlbum={handleViewAlbum}
                  onPlaySlideshow={handlePlaySlideshow}
                  onBack={handleBackToMap}
                />
              </div>
            )}
          </div>
        )}

        {/* Album View */}
        {showAlbum && selectedPin && (
          <AlbumGrid
            pin={selectedPin}
            onClose={handleCloseAlbum}
            onAddSong={handleAddSong}
            onAddPhotos={handleAddPhotos}
            onRemovePhoto={handleRemovePhoto}
            isSyncing={selectedPinUploadSummary.active > 0}
            syncProgress={selectedPinUploadSummary.averageProgress}
            uploadItems={selectedPinUploads}
            uploadStatusLabel={selectedPinUploadSummary.label}
            uploadSummary={selectedPinBatchSummary}
            optimisticPhotos={selectedPinOptimisticPhotos}
            onCancelUpload={handleCancelUploadItem}
            onRetryFailedUploads={handleRetryFailedUploads}
          />
        )}

        {/* Slideshow View */}
        {showSlideshow && selectedPin && (
          <Slideshow
            pin={selectedPin}
            onClose={handleCloseSlideshow}
          />
        )}
      </main>

      {/* Spotify Panel */}
      {showSpotifyPanel && (
        <SpotifyPanel
          onClose={() => setShowSpotifyPanel(false)}
          onSelect={handleSongSelect}
        />
      )}

      {/* Add Pin Modal */}
      {showAddPinModal && newPinLocation && (
        <AddPinModal
          lat={newPinLocation.lat}
          lng={newPinLocation.lng}
          onAdd={handleAddPin}
          onCancel={handleCancelAddPin}
        />
      )}

      {canViewDiagnostics && showDiagnostics && (
        <section className="diagnostics-panel">
          <div className="diagnostics-body">
            <p><strong>Project:</strong> {import.meta.env.VITE_FIREBASE_PROJECT_ID || 'n/a'}</p>
            <p><strong>Auth Domain:</strong> {import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'n/a'}</p>
            <p><strong>Storage Bucket (env):</strong> {import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'n/a'}</p>
            <p><strong>Buckets Tried:</strong> {STORAGE_BUCKET_CANDIDATES.join(', ')}</p>
            <p><strong>User:</strong> {user.email || 'n/a'}</p>
            <p><strong>Firestore Health:</strong> {firestoreHealth}</p>
            <p><strong>Last Action:</strong> {lastAction}</p>
            <p><strong>Last Action At:</strong> {lastActionAt || 'n/a'}</p>
            <p><strong>Active Uploads:</strong> {selectedPinUploadSummary.active}</p>
            <p><strong>Last Firestore Error:</strong> {lastFirestoreError || 'none'}</p>
            <p><strong>Last Storage Error:</strong> {lastStorageError || 'none'}</p>
            <p><strong>Health Message:</strong> {firestoreHealthMessage || 'none'}</p>
          </div>
        </section>
      )}
    </div>
  );
}

export default App;