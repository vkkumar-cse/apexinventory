import * as faceapi from "face-api.js";

export type FaceDescriptor = number[];
export type FaceDescriptors = FaceDescriptor[];

export type FaceMatchResult = {
  descriptor: FaceDescriptor;
  storedDescriptor: FaceDescriptor;
  distance: number;
  score: number;
  bestDescriptorIndex: number;
  bestFrame: number;
};

export type FaceFrameDescriptor = {
  descriptor: FaceDescriptor;
  detectionScore: number;
  box: { x: number; y: number; width: number; height: number };
  videoWidth: number;
  videoHeight: number;
};

export type FacePreviewResult = {
  status: FaceGuidanceStatus;
  message: string;
  detectionScore: number | null;
  box: { x: number; y: number; width: number; height: number } | null;
  videoWidth: number;
  videoHeight: number;
};

export type MultiFrameFaceMatchResult = FaceMatchResult & {
  detectionScore: number;
  framesChecked: number;
  validFrames: number;
  processingTime: number;
};

export type FaceCaptureErrorCode =
  | "NO_FACE"
  | "MULTIPLE_FACES"
  | "LOW_CONFIDENCE"
  | "CAMERA_NOT_READY";

export type FaceGuidanceStatus = "waiting" | "searching" | "detected" | "checking" | "captured" | "error";

const MODEL_URL = "/models/face-api";
const DETECTION_SCORE_THRESHOLD = 0.4;
const MIN_RELIABLE_DETECTION_SCORE = 0.4;
const CAPTURE_RETRY_COUNT = 10;
const CAPTURE_RETRY_INTERVAL_MS = 120;
const VERIFICATION_FRAME_COUNT = 10;
const VERIFICATION_FRAME_INTERVAL_MS = 60;

export const FACE_MATCH_THRESHOLD = Number(import.meta.env.VITE_FACE_THRESHOLD ?? 0.45);

export const REGISTRATION_STEPS = [
  { label: "Straight Face", instruction: "Look directly into the camera." },
  { label: "Slight Left", instruction: "Turn your head slightly to the left." },
  { label: "Slight Right", instruction: "Turn your head slightly to the right." },
  { label: "Slight Up", instruction: "Tilt your head slightly upwards." },
  { label: "Slight Down", instruction: "Tilt your head slightly downwards." },
];

let modelLoadPromise: Promise<void> | null = null;
const previewDetectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: DETECTION_SCORE_THRESHOLD });
const descriptorDetectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: DETECTION_SCORE_THRESHOLD });
const descriptorNormalizationCache = new WeakMap<object, FaceDescriptors>();

export const loadFaceModels = () => {
  if (!modelLoadPromise) {
    modelLoadPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]).then(() => undefined);
  }

  return modelLoadPromise;
};

export class FaceCaptureError extends Error {
  code: FaceCaptureErrorCode;

  constructor(code: FaceCaptureErrorCode, message: string) {
    super(message);
    this.name = "FaceCaptureError";
    this.code = code;
  }
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export const getFaceErrorMessage = (error: unknown) => {
  const code = error instanceof FaceCaptureError ? error.code : null;

  if (code === "NO_FACE") return "No Face Detected";
  if (code === "MULTIPLE_FACES") return "Only One Face Allowed";
  if (code === "LOW_CONFIDENCE") return "Move Closer";
  if (code === "CAMERA_NOT_READY") return "Camera Initializing...";

  return "Face Not Matched";
};

const getVideoDimensions = (video: HTMLVideoElement) => ({
  videoWidth: video.videoWidth || video.clientWidth || 1,
  videoHeight: video.videoHeight || video.clientHeight || 1,
});

const ensureCameraReady = (video: HTMLVideoElement) => {
  if (video.readyState !== HTMLMediaElement.HAVE_ENOUGH_DATA || video.videoWidth <= 0 || video.videoHeight <= 0) {
    throw new FaceCaptureError("CAMERA_NOT_READY", "Camera Not Ready");
  }
};

export const waitForCameraReady = async (video: HTMLVideoElement, stabilizationMs = 2000) => {
  const startedAt = performance.now();
  while (performance.now() - startedAt < 6000) {
    if (video.readyState === HTMLMediaElement.HAVE_ENOUGH_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
      await wait(stabilizationMs);
      ensureCameraReady(video);
      return;
    }
    await wait(100);
  }

  throw new FaceCaptureError("CAMERA_NOT_READY", "Camera Not Ready");
};

const validateDetectionConfidence = (detectionScore: number) => {
  if (detectionScore < MIN_RELIABLE_DETECTION_SCORE) {
    throw new FaceCaptureError("LOW_CONFIDENCE", "Move Closer");
  }
};

export const getFacePreviewFromVideo = async (video: HTMLVideoElement): Promise<FacePreviewResult> => {
  await loadFaceModels();
  ensureCameraReady(video);

  const { videoWidth, videoHeight } = getVideoDimensions(video);
  const detections = await faceapi.detectAllFaces(video, previewDetectorOptions);

  if (detections.length === 0) {
    return { status: "searching", message: "Searching for Face...", detectionScore: null, box: null, videoWidth, videoHeight };
  }

  if (detections.length > 1) {
    return { status: "error", message: "Only One Face Allowed", detectionScore: null, box: null, videoWidth, videoHeight };
  }

  const detection = detections[0];
  const box = detection.box;
  try {
    validateDetectionConfidence(detection.score);
    return {
      status: "detected",
      message: "Face Detected",
      detectionScore: detection.score,
      box,
      videoWidth,
      videoHeight,
    };
  } catch (error) {
    return {
      status: "detected",
      message: getFaceErrorMessage(error),
      detectionScore: detection.score,
      box,
      videoWidth,
      videoHeight,
    };
  }
};

export const getFaceFrameDescriptorFromVideo = async (video: HTMLVideoElement): Promise<FaceFrameDescriptor> => {
  await loadFaceModels();
  ensureCameraReady(video);

  const detections = await faceapi
    .detectAllFaces(video, descriptorDetectorOptions)
    .withFaceLandmarks()
    .withFaceDescriptors();

  if (detections.length === 0) {
    throw new FaceCaptureError("NO_FACE", "No Face Detected");
  }

  if (detections.length > 1) {
    throw new FaceCaptureError("MULTIPLE_FACES", "Only One Face Allowed");
  }

  const detection = detections[0].detection;
  const detectionScore = detection.score;
  const box = detection.box;
  const { videoWidth, videoHeight } = getVideoDimensions(video);
  validateDetectionConfidence(detectionScore);

  return {
    descriptor: Array.from(detections[0].descriptor),
    detectionScore,
    box,
    videoWidth,
    videoHeight,
  };
};

export const getFaceFrameDescriptorWithRetry = async (video: HTMLVideoElement): Promise<FaceFrameDescriptor> => {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < CAPTURE_RETRY_COUNT; attempt += 1) {
    if (attempt > 0) await wait(CAPTURE_RETRY_INTERVAL_MS);

    try {
      return await getFaceFrameDescriptorFromVideo(video);
    } catch (error) {
      lastError = error;
      if (error instanceof FaceCaptureError && error.code === "MULTIPLE_FACES") {
        throw error;
      }
    }
  }

  throw lastError ?? new FaceCaptureError("NO_FACE", "No Face Detected");
};

export const getFaceDescriptorFromVideo = async (video: HTMLVideoElement): Promise<FaceDescriptor> => {
  const result = await getFaceFrameDescriptorFromVideo(video);
  return result.descriptor;
};

export const compareFaceDescriptors = (
  liveDescriptor: FaceDescriptor,
  storedDescriptor: FaceDescriptor,
  bestDescriptorIndex = -1,
  bestFrame = -1
): FaceMatchResult => {
  const distance = faceapi.euclideanDistance(liveDescriptor, storedDescriptor);
  const score = Math.max(0, Math.min(1, 1 - distance));

  return {
    descriptor: liveDescriptor,
    storedDescriptor,
    distance,
    score: Number(score.toFixed(4)),
    bestDescriptorIndex,
    bestFrame,
  };
};

export const verifyFaceAcrossFrames = async (
  video: HTMLVideoElement,
  storedDescriptors: FaceDescriptors
): Promise<MultiFrameFaceMatchResult> => {
  const startedAt = performance.now();
  let bestMatch: (FaceMatchResult & { detectionScore: number }) | null = null;
  let lastGuidanceError: FaceCaptureError | null = null;
  let validFrames = 0;

  if (!hasValidFaceDescriptors(storedDescriptors)) {
    throw new FaceCaptureError("NO_FACE", "Registration Required");
  }

  for (let frameIndex = 0; frameIndex < VERIFICATION_FRAME_COUNT; frameIndex++) {
    if (frameIndex > 0) {
      await wait(VERIFICATION_FRAME_INTERVAL_MS);
    }

    try {
      const frame = await getFaceFrameDescriptorFromVideo(video);
      let frameBestMatch: FaceMatchResult | null = null;
      for (let descriptorIndex = 0; descriptorIndex < storedDescriptors.length; descriptorIndex += 1) {
        const candidate = compareFaceDescriptors(frame.descriptor, storedDescriptors[descriptorIndex], descriptorIndex, frameIndex);
        if (!frameBestMatch || candidate.distance < frameBestMatch.distance) {
          frameBestMatch = candidate;
        }
      }

      if (!frameBestMatch) continue;
      validFrames += 1;

      if (!bestMatch || frameBestMatch.distance < bestMatch.distance) {
        bestMatch = {
          ...frameBestMatch,
          detectionScore: frame.detectionScore,
        };
      }

      if (frameBestMatch.distance <= FACE_MATCH_THRESHOLD) {
        return {
          ...frameBestMatch,
          detectionScore: frame.detectionScore,
          framesChecked: frameIndex + 1,
          validFrames,
          processingTime: Math.round(performance.now() - startedAt),
        };
      }
    } catch (error) {
      if (error instanceof FaceCaptureError && error.code === "MULTIPLE_FACES") {
        throw error;
      }

      if (error instanceof FaceCaptureError) {
        lastGuidanceError = error;
      }
    }
  }

  if (!bestMatch) {
    throw lastGuidanceError ?? new FaceCaptureError("NO_FACE", "No Face Detected");
  }

  return {
    ...bestMatch,
    framesChecked: VERIFICATION_FRAME_COUNT,
    validFrames,
    processingTime: Math.round(performance.now() - startedAt),
  };
};

export const isValidFaceDescriptor = (value: unknown): value is FaceDescriptor => {
  return Array.isArray(value) && value.length === 128 && value.every((item) => typeof item === "number");
};

export const normalizeFaceDescriptors = (faceProfile: { face_descriptors?: unknown; face_descriptor?: unknown } | null | undefined): FaceDescriptors => {
  if (!faceProfile) return [];

  if (typeof faceProfile === "object") {
    const cached = descriptorNormalizationCache.get(faceProfile);
    if (cached) return cached;
  }

  let descriptors: FaceDescriptors = [];
  if (Array.isArray(faceProfile.face_descriptors)) {
    descriptors = faceProfile.face_descriptors.filter(isValidFaceDescriptor);
  }

  if (descriptors.length === 0 && isValidFaceDescriptor(faceProfile.face_descriptor)) {
    descriptors = [faceProfile.face_descriptor];
  }

  if (typeof faceProfile === "object") {
    descriptorNormalizationCache.set(faceProfile, descriptors);
  }

  return descriptors;
};

export const hasValidFaceDescriptors = (value: unknown): value is FaceDescriptors => {
  return Array.isArray(value) && value.length > 0 && value.every(isValidFaceDescriptor);
};
