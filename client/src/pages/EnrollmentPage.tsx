import { useState, type ChangeEvent } from 'react';
import { enrollmentService, type Traveler } from '../services/enrollmentService';
import { scannerService } from '../services/scannerService';
import { getApiErrorMessage } from '../services/api';
import { CameraCaptureModal } from '../components/CameraCaptureModal';
import {
  UserPlus,
  Fingerprint,
  Eye,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Radio,
  Camera,
} from 'lucide-react';

export function EnrollmentPage() {
  // Step 1 State: Traveler Demographic Form
  const [fan, setFan] = useState('');
  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<'MALE' | 'FEMALE'>('MALE');
  const [nationality, setNationality] = useState('');
  const [photo, setPhoto] = useState<string>('');

  const [creatingTraveler, setCreatingTraveler] = useState(false);
  const [travelerError, setTravelerError] = useState('');
  const [registeredTraveler, setRegisteredTraveler] = useState<Traveler | null>(null);

  // Step 2 State: Biometric Capture Mode & Data
  const [captureMethod, setCaptureMethod] = useState<'simulation' | 'scanner'>('simulation');
  const [fingerprintTemplate, setFingerprintTemplate] = useState('');
  const [irisTemplate, setIrisTemplate] = useState('');
  const [fingerprintFileName, setFingerprintFileName] = useState('');
  const [irisFileName, setIrisFileName] = useState('');

  // Live Camera Capture State
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<'fingerprint' | 'iris'>('iris');

  const handleCameraCapture = (imageDataUrl: string) => {
    const base64Data = imageDataUrl.includes(',') ? imageDataUrl.split(',')[1] : imageDataUrl;
    if (cameraTarget === 'fingerprint') {
      setFingerprintTemplate(base64Data);
      setFingerprintFileName('Captured Fingerprint (Live Windows Camera)');
    } else {
      setIrisTemplate(base64Data);
      setIrisFileName('Captured Iris (Live Windows Camera)');
    }
  };

  const [capturingFingerprint, setCapturingFingerprint] = useState(false);
  const [capturingIris, setCapturingIris] = useState(false);

  const [enrollingBiometric, setEnrollingBiometric] = useState(false);
  const [biometricError, setBiometricError] = useState('');
  const [enrollmentSuccess, setEnrollmentSuccess] = useState(false);

  // File to base64 helper for simulation mode
  const handleFileUpload = (
    e: ChangeEvent<HTMLInputElement>,
    setTemplate: (val: string) => void,
    setFileName: (val: string) => void,
    allowedExtensions: string[]
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!allowedExtensions.includes(extension)) {
      setBiometricError(`Invalid file format. Accepted formats: ${allowedExtensions.map(ext => ext.toUpperCase()).join(', ')}`);
      setTemplate('');
      setFileName('');
      e.target.value = '';
      return;
    }

    setBiometricError('');
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data:image/...;base64, prefix if present for API template format
      const base64Data = result.includes(',') ? result.split(',')[1] : result;
      setTemplate(base64Data);
    };
    reader.readAsDataURL(file);
  };


  // Step 1: Submit Traveler Demographic
  const handleCreateTraveler = async (e: React.FormEvent) => {
    e.preventDefault();
    setTravelerError('');
    setCreatingTraveler(true);
    setEnrollmentSuccess(false);

    try {
      const res = await enrollmentService.enrollTraveler({
        fan: fan.trim(),
        fullName: fullName.trim(),
        dateOfBirth,
        gender,
        nationality: nationality.trim(),
        photo: photo || undefined,
      });

      const travelerData = res.traveler ?? res;
      setRegisteredTraveler(travelerData);
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Failed to create traveler.');
      setTravelerError(msg);
    } finally {
      setCreatingTraveler(false);
    }
  };

  // Step 2 Methods: Scanner Capture
  const handleScanFingerprint = async () => {
    setCapturingFingerprint(true);
    try {
      const data = await scannerService.captureFingerprint();
      const base64Data = btoa(data);
      setFingerprintTemplate(base64Data);
      setFingerprintFileName('Captured Fingerprint (Hardware Scanner)');
    } catch {
      setBiometricError('Failed to capture fingerprint from scanner.');
    } finally {
      setCapturingFingerprint(false);
    }
  };

  const handleScanIris = async () => {
    setCapturingIris(true);
    try {
      const data = await scannerService.captureIris();
      const base64Data = btoa(data);
      setIrisTemplate(base64Data);
      setIrisFileName('Captured Iris (Hardware Scanner)');
    } catch {
      setBiometricError('Failed to capture iris from scanner.');
    } finally {
      setCapturingIris(false);
    }
  };

  // Step 2: Submit Biometrics
  const handleEnrollBiometrics = async () => {
    if (!registeredTraveler) return;
    setBiometricError('');
    setEnrollingBiometric(true);

    try {
      await enrollmentService.enrollBiometric({
        fan: registeredTraveler.fan,
        fingerprintTemplate,
        irisTemplate,
      });

      setEnrollmentSuccess(true);
      setRegisteredTraveler((prev) =>
        prev ? { ...prev, enrollmentStatus: 'COMPLETED' } : null
      );
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Biometric enrollment failed.');
      setBiometricError(msg);
    } finally {
      setEnrollingBiometric(false);
    }
  };

  const handleResetForm = () => {
    setFan('');
    setFullName('');
    setDateOfBirth('');
    setGender('MALE');
    setNationality('');
    setPhoto('');
    setRegisteredTraveler(null);
    setFingerprintTemplate('');
    setIrisTemplate('');
    setFingerprintFileName('');
    setIrisFileName('');
    setEnrollmentSuccess(false);
    setTravelerError('');
    setBiometricError('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-navy-800 flex items-center gap-2">
            <UserPlus size={20} className="text-navy-700" />
            Traveler Enrollment
          </h2>
          <p className="text-sm text-navy-400">
            Register demographic information and capture biometric templates
          </p>
        </div>
        {registeredTraveler && (
          <button onClick={handleResetForm} className="btn-secondary text-xs">
            Start New Enrollment
          </button>
        )}
      </div>

      {/* Workflow Progress */}
      <div className="grid grid-cols-2 gap-4">
        <div
          className={`card p-4 flex items-center gap-3 border-l-4 ${
            registeredTraveler ? 'border-l-accent-green bg-accent-green-soft/20' : 'border-l-accent-blue bg-white'
          }`}
        >
          <div
            className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-sm ${
              registeredTraveler ? 'bg-accent-green text-white' : 'bg-navy-800 text-white'
            }`}
          >
            1
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-navy-400">Step 1</div>
            <div className="text-sm font-semibold text-navy-800">Traveler Demographics</div>
          </div>
        </div>

        <div
          className={`card p-4 flex items-center gap-3 border-l-4 ${
            enrollmentSuccess
              ? 'border-l-accent-green bg-accent-green-soft/20'
              : registeredTraveler
              ? 'border-l-accent-blue bg-white'
              : 'border-l-navy-200 bg-navy-50/50 opacity-60'
          }`}
        >
          <div
            className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-sm ${
              enrollmentSuccess
                ? 'bg-accent-green text-white'
                : registeredTraveler
                ? 'bg-accent-blue text-white'
                : 'bg-navy-300 text-white'
            }`}
          >
            2
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-navy-400">Step 2</div>
            <div className="text-sm font-semibold text-navy-800">Biometric Enrollment</div>
          </div>
        </div>
      </div>

      {/* STEP 1: Traveler Registration Form */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4 border-b border-navy-100 pb-3">
          <h3 className="text-sm font-semibold text-navy-800 flex items-center gap-2">
            <UserPlus size={18} /> Step 1: Create Traveler Record
          </h3>
          {registeredTraveler && (
            <span className="badge-verified flex items-center gap-1">
              <CheckCircle2 size={13} /> Registered
            </span>
          )}
        </div>

        {travelerError && (
          <div className="mb-4 flex items-center gap-2 p-3 bg-accent-red-soft text-accent-red rounded-lg text-sm border border-red-200">
            <AlertCircle size={16} /> {travelerError}
          </div>
        )}

        {registeredTraveler ? (
          <div className="rounded-xl border border-navy-200 bg-navy-50/50 p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-xs text-navy-400 font-medium">FAN</div>
              <div className="font-semibold text-navy-800">{registeredTraveler.fan}</div>
            </div>
            <div>
              <div className="text-xs text-navy-400 font-medium">Full Name</div>
              <div className="font-semibold text-navy-800">{registeredTraveler.fullName}</div>
            </div>
            <div>
              <div className="text-xs text-navy-400 font-medium">Date of Birth</div>
              <div className="font-semibold text-navy-800">
                {new Date(registeredTraveler.dateOfBirth).toLocaleDateString()}
              </div>
            </div>
            <div>
              <div className="text-xs text-navy-400 font-medium">Nationality</div>
              <div className="font-semibold text-navy-800">{registeredTraveler.nationality}</div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateTraveler} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label">FAN (File / Traveler No.) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. FAN-102938"
                  value={fan}
                  onChange={(e) => setFan(e.target.value)}
                  className="input font-mono"
                />
              </div>
              <div>
                <label className="label">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jane Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Date of Birth *</label>
                <input
                  type="date"
                  required
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="input"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label">Gender *</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as 'MALE' | 'FEMALE')}
                  className="input"
                >
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
              </div>
              <div>
                <label className="label">Nationality *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. United States"
                  value={nationality}
                  onChange={(e) => setNationality(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Photo URL (Optional)</label>
                <input
                  type="text"
                  placeholder="https://..."
                  value={photo}
                  onChange={(e) => setPhoto(e.target.value)}
                  className="input"
                />
              </div>
            </div>

            <div className="pt-2">
              <button type="submit" disabled={creatingTraveler} className="btn-primary">
                {creatingTraveler ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Creating Traveler...
                  </>
                ) : (
                  <>
                    <UserPlus size={16} /> Create Traveler
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* STEP 2: Biometric Enrollment */}
      <div className={`card p-6 ${!registeredTraveler ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between mb-4 border-b border-navy-100 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-navy-800 flex items-center gap-2">
              <Fingerprint size={18} /> Step 2: Biometric Enrollment
            </h3>
            <p className="text-xs text-navy-400 mt-0.5">
              Capture fingerprint and iris biometric templates
            </p>
          </div>
          {enrollmentSuccess && (
            <span className="badge-verified flex items-center gap-1">
              <CheckCircle2 size={13} /> Enrollment Successful
            </span>
          )}
        </div>

        {biometricError && (
          <div className="mb-4 flex items-center gap-2 p-3 bg-accent-red-soft text-accent-red rounded-lg text-sm border border-red-200">
            <AlertCircle size={16} /> {biometricError}
          </div>
        )}

        {enrollmentSuccess ? (
          <div className="card bg-accent-green-soft border border-green-200 p-5 text-center space-y-2">
            <ShieldCheck size={36} className="mx-auto text-accent-green" />
            <h4 className="text-base font-bold text-navy-800">Enrollment Successful</h4>
            <p className="text-xs text-navy-600">
              Traveler {registeredTraveler?.fullName} ({registeredTraveler?.fan}) is now fully enrolled.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Capture Method Selection */}
            <div>
              <label className="label">Select Capture Method</label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-navy-700 cursor-pointer">
                  <input
                    type="radio"
                    name="captureMethod"
                    value="simulation"
                    checked={captureMethod === 'simulation'}
                    onChange={() => setCaptureMethod('simulation')}
                    className="accent-navy-700"
                  />
                  <Radio size={16} className="text-navy-500" />
                  Method 1: Simulation (File Upload)
                </label>
                <label className="flex items-center gap-2 text-sm text-navy-700 cursor-pointer">
                  <input
                    type="radio"
                    name="captureMethod"
                    value="scanner"
                    checked={captureMethod === 'scanner'}
                    onChange={() => setCaptureMethod('scanner')}
                    className="accent-navy-700"
                  />
                  <Fingerprint size={16} className="text-navy-500" />
                  Method 2: Scanner Device
                </label>
              </div>
            </div>

            {/* Method 1: Upload Simulation & Live Camera */}
            {captureMethod === 'simulation' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-dashed border-navy-200 rounded-xl p-4 text-center hover:bg-navy-50/50 transition-colors">
                  <Fingerprint size={24} className="mx-auto text-navy-400 mb-2" />
                  <div className="text-xs font-semibold text-navy-700 mb-1">Fingerprint Image</div>
                  <div className="text-[10px] text-navy-400 mb-2 font-mono">Accepted: PNG, JPG, JPEG, BMP, TIF, TIFF</div>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/bmp,image/tiff,image/x-tiff,.png,.jpg,.jpeg,.bmp,.tif,.tiff"
                    onChange={(e) => handleFileUpload(e, setFingerprintTemplate, setFingerprintFileName, ['png', 'jpg', 'jpeg', 'bmp', 'tif', 'tiff'])}
                    className="hidden"
                    id="fp-upload"
                  />
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <label htmlFor="fp-upload" className="btn-secondary text-xs cursor-pointer inline-flex items-center gap-1">
                      <Upload size={13} /> Upload Image
                    </label>
                    <button
                      type="button"
                      onClick={() => { setCameraTarget('fingerprint'); setCameraModalOpen(true); }}
                      className="btn-secondary text-xs inline-flex items-center gap-1 text-navy-600 hover:text-accent-blue"
                      title="Fun Alternative: Use camera to take a photo of finger"
                    >
                      <Camera size={13} /> Camera (Fun Alt)
                    </button>
                  </div>
                  {fingerprintFileName && (
                    <div className="mt-2 text-xs text-accent-green font-medium flex items-center justify-center gap-1">
                      <CheckCircle2 size={12} /> {fingerprintFileName}
                    </div>
                  )}
                </div>

                <div className="border border-dashed border-navy-200 rounded-xl p-4 text-center hover:bg-navy-50/50 transition-colors">
                  <Eye size={24} className="mx-auto text-navy-400 mb-2" />
                  <div className="text-xs font-semibold text-navy-700 mb-1">Iris Image / Live Camera</div>
                  <div className="text-[10px] text-navy-400 mb-2 font-mono">Accepted: PNG, JPG, JPEG, BMP or Windows Camera</div>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/bmp,.png,.jpg,.jpeg,.bmp"
                    onChange={(e) => handleFileUpload(e, setIrisTemplate, setIrisFileName, ['png', 'jpg', 'jpeg', 'bmp'])}
                    className="hidden"
                    id="iris-upload"
                  />
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setCameraTarget('iris'); setCameraModalOpen(true); }}
                      className="btn-primary text-xs inline-flex items-center gap-1"
                    >
                      <Camera size={13} /> Use Windows Camera
                    </button>
                    <label htmlFor="iris-upload" className="btn-secondary text-xs cursor-pointer inline-flex items-center gap-1">
                      <Upload size={13} /> Upload File
                    </label>
                  </div>
                  {irisFileName && (
                    <div className="mt-2 text-xs text-accent-green font-medium flex items-center justify-center gap-1">
                      <CheckCircle2 size={12} /> {irisFileName}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Method 2: Device Scanner */}
            {captureMethod === 'scanner' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-navy-200 rounded-xl p-5 text-center bg-navy-50/30">
                  <Fingerprint size={28} className="mx-auto text-navy-700 mb-2" />
                  <div className="text-sm font-semibold text-navy-800 mb-1">Windows Fingerprint Sensor</div>
                  <div className="text-[11px] text-navy-400 mb-3">Touch built-in reader or USB biometric scanner</div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      onClick={handleScanFingerprint}
                      disabled={capturingFingerprint}
                      className="btn-primary text-xs inline-flex items-center gap-1 px-4 py-2"
                    >
                      {capturingFingerprint ? (
                        <>
                          <Loader2 size={14} className="animate-spin" /> Scanning Sensor...
                        </>
                      ) : (
                        <>
                          <Fingerprint size={14} /> Touch Fingerprint Sensor
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setCameraTarget('fingerprint'); setCameraModalOpen(true); }}
                      className="btn-secondary text-xs inline-flex items-center gap-1"
                      title="Fun Alternative: Use camera snapshot instead"
                    >
                      <Camera size={13} /> Camera (Fun Alt)
                    </button>
                  </div>
                  {fingerprintTemplate && (
                    <div className="mt-2 text-xs text-accent-green font-medium flex items-center justify-center gap-1">
                      <CheckCircle2 size={12} /> Fingerprint Captured
                    </div>
                  )}
                </div>

                <div className="border border-navy-200 rounded-xl p-5 text-center bg-navy-50/30">
                  <Eye size={28} className="mx-auto text-navy-700 mb-2" />
                  <div className="text-sm font-semibold text-navy-800 mb-1">Windows Camera (Iris Scan)</div>
                  <div className="text-[11px] text-navy-400 mb-3">Live webcam iris capture or iris scanner</div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setCameraTarget('iris'); setCameraModalOpen(true); }}
                      className="btn-primary text-xs inline-flex items-center gap-1 px-4 py-2"
                    >
                      <Camera size={14} /> Open Windows Camera
                    </button>
                    <button
                      onClick={handleScanIris}
                      disabled={capturingIris}
                      className="btn-secondary text-xs inline-flex items-center gap-1"
                    >
                      {capturingIris ? (
                        <>
                          <Loader2 size={14} className="animate-spin" /> Scanning...
                        </>
                      ) : (
                        <>
                          <Eye size={14} /> Iris Scanner
                        </>
                      )}
                    </button>
                  </div>
                  {irisTemplate && (
                    <div className="mt-2 text-xs text-accent-green font-medium flex items-center justify-center gap-1">
                      <CheckCircle2 size={12} /> Iris Captured
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="pt-2">
              <button
                onClick={handleEnrollBiometrics}
                disabled={!fingerprintTemplate || !irisTemplate || enrollingBiometric}
                className="btn-primary disabled:opacity-50"
              >
                {enrollingBiometric ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Enrolling...
                  </>
                ) : (
                  <>
                    <ShieldCheck size={16} /> Complete Biometric Enrollment
                  </>
                )}
              </button>
              {(!fingerprintTemplate || !irisTemplate) && (
                <p className="text-xs text-navy-400 mt-2">
                  * Both fingerprint and iris templates must be captured before completing enrollment.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Live Windows Camera Capture Modal */}
      <CameraCaptureModal
        isOpen={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        onCapture={handleCameraCapture}
        title={cameraTarget === 'fingerprint' ? 'Live Camera Fingerprint Capture' : 'Live Camera Iris Capture'}
        subtitle={
          cameraTarget === 'fingerprint'
            ? 'Align right index finger within the target frame and capture photo'
            : 'Align traveler iris within the target frame and capture clear photo'
        }
      />
    </div>
  );
}
