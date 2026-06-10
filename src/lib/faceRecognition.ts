import * as faceapi from "face-api.js";

export type FaceDescriptor = number[];

export type FaceMatchResult = {
  descriptor: FaceDescriptor;
  distance: number;
  score: number;
};

const MODEL_URL = "/models/face-api";
const MATCH_DISTANCE_THRESHOLD = 0.55;

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

export const getFaceDescriptorFromVideo = async (video: HTMLVideoElement): Promise<FaceDescriptor> => {
  await loadFaceModels();

  const detections = await faceapi
    .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors();

  if (detections.length === 0) {
    throw new Error("No face detected");
  }

  if (detections.length > 1) {
    throw new Error("Multiple faces detected");
  }

  return Array.from(detections[0].descriptor);
};

export const compareFaceDescriptors = (liveDescriptor: FaceDescriptor, storedDescriptor: FaceDescriptor): FaceMatchResult => {
  const distance = faceapi.euclideanDistance(liveDescriptor, storedDescriptor);
  const score = Math.max(0, Math.min(1, 1 - distance));

  if (distance > MATCH_DISTANCE_THRESHOLD) {
    throw new Error("Face not matched");
  }

  return {
    descriptor: liveDescriptor,
    distance,
    score: Number(score.toFixed(4)),
  };
};

export const isValidFaceDescriptor = (value: unknown): value is FaceDescriptor => {
  return Array.isArray(value) && value.length === 128 && value.every((item) => typeof item === "number");
};
