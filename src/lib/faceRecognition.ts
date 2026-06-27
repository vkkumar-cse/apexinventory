import * as faceapi from "face-api.js";

export type FaceDescriptor = number[];

export type FaceMatchResult = {
  descriptor: FaceDescriptor;
  distance: number;
  score: number;
};

export type FaceFrameDescriptor = {
  descriptor: FaceDescriptor;
  detectionScore: number;
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
  | "FACE_TOO_SMALL"
  | "CAMERA_NOT_READY";

const MODEL_URL = "/models/face-api";
const DETECTION_SCORE_THRESHOLD = 0.35;
const MIN_RELIABLE_DETECTION_SCORE = 0.5;
const MIN_FACE_SIZE_RATIO = 0.18;
const VERIFICATION_FRAME_COUNT = 10;
const VERIFICATION_FRAME_INTERVAL_MS = 225;

export const FACE_MATCH_THRESHOLD = Number(import.meta.env.VITE_FACE_THRESHOLD ?? 0.45);

export const REGISTRATION_STEPS = [
  { label: "Look Straight", instruction: "Look directly into the camera." },
  { label: "Turn Slightly Left", instruction: "Turn your head slightly to the left." },
  { label: "Turn Slightly Right", instruction: "Turn your head slightly to the right." },
  { label: "Look Slightly Up", instruction: "Tilt your head slightly upwards." },
  { label: "Look Slightly Down", instruction: "Tilt your head slightly downwards." },
];

let modelLoadPromise: Promise<void> | null = null;

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
  if (code === "LOW_CONFIDENCE") return "Improve Lighting";
  if (code === "FACE_TOO_SMALL") return "Move Closer To Camera";
  if (code === "CAMERA_NOT_READY") return "Camera Not Ready";

  return "Face Not Matched";
};

export const averageFaceDescriptors = (descriptors: FaceDescriptor[]): FaceDescriptor => {
  const averageDescriptor = new Array(128).fill(0);

  for (let i = 0; i < averageDescriptor.length; i++) {
    averageDescriptor[i] = descriptors.reduce((sum, descriptor) => sum + descriptor[i], 0) / descriptors.length;
  }

  return averageDescriptor;
};

export const getFaceFrameDescriptorFromVideo = async (video: HTMLVideoElement): Promise<FaceFrameDescriptor> => {
  await loadFaceModels();

  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    throw new FaceCaptureError("CAMERA_NOT_READY", "Camera Not Ready");
  }

  const detections = await faceapi
    .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: DETECTION_SCORE_THRESHOLD }))
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
  const videoWidth = video.videoWidth || video.clientWidth || 1;
  const videoHeight = video.videoHeight || video.clientHeight || 1;
  const faceSizeRatio = Math.min(box.width / videoWidth, box.height / videoHeight);

  if (faceSizeRatio < MIN_FACE_SIZE_RATIO) {
    throw new FaceCaptureError("FACE_TOO_SMALL", "Move Closer To Camera");
  }

  if (detectionScore < MIN_RELIABLE_DETECTION_SCORE) {
    throw new FaceCaptureError("LOW_CONFIDENCE", "Improve Lighting");
  }

  return {
    descriptor: Array.from(detections[0].descriptor),
    detectionScore,
  };
};

export const getFaceDescriptorFromVideo = async (video: HTMLVideoElement): Promise<FaceDescriptor> => {
  const result = await getFaceFrameDescriptorFromVideo(video);
  return result.descriptor;
};

export const compareFaceDescriptors = (liveDescriptor: FaceDescriptor, storedDescriptor: FaceDescriptor): FaceMatchResult => {
  const distance = faceapi.euclideanDistance(liveDescriptor, storedDescriptor);
  const score = Math.max(0, Math.min(1, 1 - distance));

  return {
    descriptor: liveDescriptor,
    distance,
    score: Number(score.toFixed(4)),
  };
};

export const verifyFaceAcrossFrames = async (
  video: HTMLVideoElement,
  storedDescriptor: FaceDescriptor
): Promise<MultiFrameFaceMatchResult> => {
  const startedAt = performance.now();
  let bestMatch: (FaceMatchResult & { detectionScore: number }) | null = null;
  let lastGuidanceError: FaceCaptureError | null = null;
  let validFrames = 0;

  for (let frameIndex = 0; frameIndex < VERIFICATION_FRAME_COUNT; frameIndex++) {
    if (frameIndex > 0) {
      await wait(VERIFICATION_FRAME_INTERVAL_MS);
    }

    try {
      const frame = await getFaceFrameDescriptorFromVideo(video);
      const match = compareFaceDescriptors(frame.descriptor, storedDescriptor);
      validFrames += 1;

      if (!bestMatch || match.distance < bestMatch.distance) {
        bestMatch = {
          ...match,
          detectionScore: frame.detectionScore,
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
