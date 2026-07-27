import api from './api';

export interface Traveler {
  fan: string;
  fullName: string;
  nationality: string;
  dateOfBirth: string;
  gender: string;
  photo?: string;
}

export interface EnrollmentTravelerPayload {
  fan: string;
  fullName: string;
  nationality: string;
  dateOfBirth: string;
  gender: string;
  photo?: string;
}

export interface BiometricPayload {
  fan: string;
  fingerprintTemplate: string;
  irisTemplate: string;
}

export const enrollmentService = {
  enrollTraveler: (payload: EnrollmentTravelerPayload) =>
    api.post('/enrollment/traveler', payload).then((r) => r.data),

  enrollBiometric: (payload: BiometricPayload) =>
    api.post('/enrollment/biometric', payload).then((r) => r.data),
};
