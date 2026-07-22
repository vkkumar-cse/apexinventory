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
  landmarks: faceapi.FaceLandmarks68;
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
const MIN_RELIABLE_DETECTION_SCORE = 0.4;
const CAPTURE_RETRY_COUNT = 10;
const CAPTURE_RETRY_INTERVAL_MS = 150;
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
const descriptorNormalizationCache = new WeakMap<object, FaceDescriptors>();

// Performance tracking variables
let averageDetectionTime = 0;
let detectionTimeSamples = 0;

export const getDetectorOptions = () => {
  const ram = (navigator as any).deviceMemory;
  const cores = navigator.hardwareConcurrency;
  // Fall back to smaller inputSize if device memory/CPU is low, or average detection exceeds 300ms
  const isSlow = (ram !== undefined && ram <= 4) || (cores !== undefined && cores < 4) || averageDetectionTime > 300;
  const inputSize = isSlow ? 224 : 320;
  return new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.40 });
};

export const recordDetectionTime = (ms: number) => {
  detectionTimeSamples++;
  averageDetectionTime = ((averageDetectionTime * (detectionTimeSamples - 1)) + ms) / detectionTimeSamples;
};

export const getAverageDetectionTime = () => averageDetectionTime;

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
  if (code === "CAMERA_NOT_READY") return "Camera Not Ready";

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

// Estimating Yaw and Pitch from facial landmarks
export type FacePoseEstimation = {
  yaw: number;
  pitch: number;
};

export const estimateFacePose = (landmarks: faceapi.FaceLandmarks68): FacePoseEstimation => {
  const positions = landmarks.positions;
  if (!positions || positions.length < 68) {
    return { yaw: 0, pitch: 0 };
  }

  // Horizontal check
  const leftEyeOuter = positions[36];
  const rightEyeOuter = positions[45];
  const noseTip = positions[30];

  const dLeft = Math.abs(noseTip.x - leftEyeOuter.x);
  const dRight = Math.abs(rightEyeOuter.x - noseTip.x);
  const totalWidth = dLeft + dRight;
  const yaw = totalWidth > 0 ? ((dLeft - dRight) / totalWidth) * 50 : 0;

  // Vertical check
  const leftEyeInner = positions[39];
  const rightEyeInner = positions[42];
  const eyeY = (leftEyeInner.y + rightEyeInner.y) / 2;

  const mouthUpper = positions[51];
  const mouthLower = positions[57];
  const mouthY = (mouthUpper.y + mouthLower.y) / 2;

  const dEyeToNose = Math.abs(noseTip.y - eyeY);
  const dNoseToMouth = Math.abs(mouthY - noseTip.y);
  const totalHeight = dEyeToNose + dNoseToMouth;
  const pitch = totalHeight > 0 ? ((dNoseToMouth - dEyeToNose) / totalHeight) * 30 : 0;

  return { yaw, pitch };
};

// Guided pose verification
export const validateFacePoseForStep = (
  landmarks: faceapi.FaceLandmarks68,
  stepIndex: number
): { isValid: boolean; message: string } => {
  const { yaw, pitch } = estimateFacePose(landmarks);

  if (import.meta.env.DEV) {
    console.log(`POSE ESTIMATION - Step: ${stepIndex}, Yaw: ${yaw.toFixed(1)}°, Pitch: ${pitch.toFixed(1)}°`);
  }

  switch (stepIndex) {
    case 0: // Straight Face
      if (Math.abs(yaw) > 12) {
        return { isValid: false, message: "Please look straight at the camera" };
      }
      if (Math.abs(pitch) > 10) {
        return { isValid: false, message: "Please look straight at the camera" };
      }
      break;
    case 1: // Slight Left
      // Head turned left, nose tip moves to user's left (camera's right)
      if (yaw >= -8) {
        return { isValid: false, message: "Please turn slightly left" };
      }
      break;
    case 2: // Slight Right
      // Head turned right, nose tip moves to user's right (camera's left)
      if (yaw <= 8) {
        return { isValid: false, message: "Please turn slightly right" };
      }
      break;
    case 3: // Slight Up
      // Head tilted up, nose tip moves closer to eyes vertical position
      if (pitch <= 6) {
        return { isValid: false, message: "Please tilt slightly up" };
      }
      break;
    case 4: // Slight Down
      // Head tilted down, nose tip moves closer to mouth vertical position
      if (pitch >= -6) {
        return { isValid: false, message: "Please tilt slightly down" };
      }
      break;
  }

  return { isValid: true, message: "Captured Successfully" };
};

// Check if three descriptors captured consecutively are frozen/duplicates
export const checkLivenessAndStability = (
  descriptors: FaceDescriptor[]
): { isValid: boolean; message: string } => {
  if (descriptors.length < 2) return { isValid: true, message: "" };

  for (let i = 0; i < descriptors.length - 1; i++) {
    const d1 = descriptors[i];
    const d2 = descriptors[i + 1];

    let sumDiff = 0;
    for (let j = 0; j < d1.length; j++) {
      sumDiff += Math.abs(d1[j] - d2[j]);
    }

    // Check if frames are mathematically identical
    if (sumDiff === 0) {
      return {
        isValid: false,
        message: "Please blink or move your head slightly"
      };
    }
  }

  return { isValid: true, message: "" };
};

export const getFaceFrameDescriptorFromVideo = async (video: HTMLVideoElement): Promise<FaceFrameDescriptor> => {
  await loadFaceModels();
  ensureCameraReady(video);

  const start = performance.now();
  const options = getDetectorOptions();

  // Face detection, landmark, and descriptor step all-in-one fluent call
  const detections = await faceapi
    .detectAllFaces(video, options)
    .withFaceLandmarks()
    .withFaceDescriptors();

  const detectTime = performance.now() - start;
  recordDetectionTime(detectTime);

  if (detections.length === 0) {
    throw new FaceCaptureError("NO_FACE", "No Face Detected");
  }

  if (detections.length > 1) {
    throw new FaceCaptureError("MULTIPLE_FACES", "Only One Face Allowed");
  }

  const result = detections[0];
  const detectionScore = result.detection.score;
  const box = result.detection.box;
  const { videoWidth, videoHeight } = getVideoDimensions(video);
  validateDetectionConfidence(detectionScore);

  return {
    descriptor: Array.from(result.descriptor),
    detectionScore,
    box,
    videoWidth,
    videoHeight,
    landmarks: result.landmarks,
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

export type VerificationProgressCallback = (
  frameIndex: number,
  bestFrameMatchIndex: number,
  bestFrameDistance: number
) => void;

export const verifyFaceAcrossFrames = async (
  video: HTMLVideoElement,
  storedDescriptors: FaceDescriptors,
  onProgress?: VerificationProgressCallback
): Promise<MultiFrameFaceMatchResult> => {
  const startedAt = performance.now();
  let bestMatch: (FaceMatchResult & { detectionScore: number }) | null = null;
  let lastGuidanceError: unknown = null;
  let validFrames = 0;
  const framesLimit = 8;

  if (!hasValidFaceDescriptors(storedDescriptors)) {
    throw new FaceCaptureError("NO_FACE", "Registration Required");
  }

  for (let frameIndex = 0; frameIndex < framesLimit; frameIndex++) {
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

      if (onProgress) {
        onProgress(frameIndex + 1, frameBestMatch.bestDescriptorIndex, frameBestMatch.distance);
      }

      if (!bestMatch || frameBestMatch.distance < bestMatch.distance) {
        bestMatch = {
          ...frameBestMatch,
          detectionScore: frame.detectionScore,
        };
      }

      if (frameBestMatch.distance <= FACE_MATCH_THRESHOLD) {
        const processingTime = Math.round(performance.now() - startedAt);
        const matchResult: MultiFrameFaceMatchResult = {
          ...frameBestMatch,
          detectionScore: frame.detectionScore,
          framesChecked: frameIndex + 1,
          validFrames,
          processingTime,
        };

        if (import.meta.env.DEV) {
          let matchCount = 0;
          for (let index = 0; index < storedDescriptors.length; index++) {
            const dist = faceapi.euclideanDistance(frame.descriptor, storedDescriptors[index]);
            if (dist <= FACE_MATCH_THRESHOLD) matchCount++;
          }
          console.log("FACE VERIFICATION", {
            descriptorsLoaded: storedDescriptors.length,
            framesProcessed: frameIndex + 1,
            bestDistance: frameBestMatch.distance,
            threshold: FACE_MATCH_THRESHOLD,
            matched: true,
            processingTime,
            descriptorMatchedIndex: frameBestMatch.bestDescriptorIndex,
            matchCount
          });
        }

        return matchResult;
      }
    } catch (error) {
      lastGuidanceError = error;
      if (error instanceof FaceCaptureError && error.code === "MULTIPLE_FACES") {
        throw error;
      }
    }
  }

  const processingTime = Math.round(performance.now() - startedAt);

  if (!bestMatch) {
    if (import.meta.env.DEV) {
      console.log("FACE VERIFICATION", {
        descriptorsLoaded: storedDescriptors.length,
        framesProcessed: framesLimit,
        bestDistance: null,
        threshold: FACE_MATCH_THRESHOLD,
        matched: false,
        processingTime,
        descriptorMatchedIndex: -1,
        matchCount: 0
      });
    }
    throw lastGuidanceError ?? new FaceCaptureError("NO_FACE", "No Face Detected");
  }

  const finalResult: MultiFrameFaceMatchResult = {
    ...bestMatch,
    framesChecked: framesLimit,
    validFrames,
    processingTime,
  };

  if (import.meta.env.DEV) {
    let matchCount = 0;
    for (let index = 0; index < storedDescriptors.length; index++) {
      const dist = faceapi.euclideanDistance(bestMatch.descriptor, storedDescriptors[index]);
      if (dist <= FACE_MATCH_THRESHOLD) matchCount++;
    }
    console.log("FACE VERIFICATION", {
      descriptorsLoaded: storedDescriptors.length,
      framesProcessed: framesLimit,
      bestDistance: bestMatch.distance,
      threshold: FACE_MATCH_THRESHOLD,
      matched: bestMatch.distance <= FACE_MATCH_THRESHOLD,
      processingTime,
      descriptorMatchedIndex: bestMatch.bestDescriptorIndex,
      matchCount
    });
  }

  return finalResult;
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
