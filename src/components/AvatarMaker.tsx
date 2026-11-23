import { useEffect, useState } from 'react';
import cubeRules from '../../config/cubes.json';
import { heightFromCm, heightFromFeet } from '../../shared/height';
import { startAvatar } from '../lib/data';

const MAX_PHOTOS = 3;

interface Props {
  free: boolean;
  wallet: number;
  onStarted: (jobId: string) => void;
  onCancel: () => void;
}

// Vault > avatar > make my avatar: photos, height, price, go.
export function AvatarMaker({ free, wallet, onStarted, onCancel }: Props) {
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [unit, setUnit] = useState<'ft' | 'cm'>('ft');
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');
  const [cm, setCm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const cost = free ? 0 : cubeRules.costs.avatar_change;
  const heightM = unit === 'ft' ? heightFromFeet(feet, inches) : heightFromCm(cm);
  const short = cost > wallet;
  const ready = photos.length > 0 && heightM !== null && !short && !busy;

  useEffect(() => {
    const urls = photos.map((p) => URL.createObjectURL(p));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  function addPhotos(list: FileList | null) {
    if (!list) return;
    // Copy the files now: the input is cleared right after this call, which empties the live FileList.
    const files = Array.from(list);
    setPhotos((p) => [...p, ...files].slice(0, MAX_PHOTOS));
  }

  async function go() {
    if (!ready || heightM === null) return;
    setBusy(true);
    setError('');
    try {
      const { job_id } = await startAvatar(photos, heightM);
      onStarted(job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'something broke. try again.');
      setBusy(false);
    }
  }

  return (
    <div className="maker">
      <div className="maker-step">1. photos of you, full body if you can ({photos.length}/{MAX_PHOTOS})</div>
      <div className="thumbs">
        {previews.map((url, i) => (
          <button key={url} className="thumb" onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} aria-label="remove photo">
            <img src={url} alt="" />
          </button>
        ))}
        {photos.length < MAX_PHOTOS && (
          <label className="btn">
            [ add photo ]
            <input type="file" accept="image/*" multiple hidden onChange={(e) => (addPhotos(e.target.files), (e.target.value = ''))} />
          </label>
        )}
      </div>

      <div className="maker-step">
        2. your height{' '}
        <button className={`link ${unit === 'ft' ? 'on' : ''}`} onClick={() => setUnit('ft')}>
          ft/in
        </button>{' '}
        <button className={`link ${unit === 'cm' ? 'on' : ''}`} onClick={() => setUnit('cm')}>
          cm
        </button>
      </div>
      {unit === 'ft' ? (
        <div className="height">
          <input inputMode="numeric" placeholder="ft" value={feet} onChange={(e) => setFeet(e.target.value)} aria-label="feet" />
          <input inputMode="numeric" placeholder="in" value={inches} onChange={(e) => setInches(e.target.value)} aria-label="inches" />
        </div>
      ) : (
        <div className="height">
          <input inputMode="numeric" placeholder="cm" value={cm} onChange={(e) => setCm(e.target.value)} aria-label="centimeters" />
        </div>
      )}

      <div className="maker-step">3. {free ? 'first avatar is free' : `costs ${cost} 🧊`}</div>
      {short && <p className="error">not enough cubes. you have {wallet} 🧊</p>}
      {error && <p className="error">{error}</p>}

      <div className="row">
        <button className="btn" onClick={onCancel} disabled={busy}>
          [ cancel ]
        </button>
        <button className="btn send" onClick={() => void go()} disabled={!ready}>
          {busy ? '[ ... ]' : free ? '[ make it ]' : `[ make it, ${cost} 🧊 ]`}
        </button>
      </div>
    </div>
  );
}
