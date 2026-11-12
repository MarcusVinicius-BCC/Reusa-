import React, { useEffect, useId, useRef, useState } from 'react';
import './post-media-picker.css';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm']);
const MB = 1024 * 1024;
const ACCEPT = [...IMAGE_TYPES, ...VIDEO_TYPES].join(',');
const EMPTY_ITEMS = [];

function MediaIcon({ kind, ...props }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {kind === 'close' ? <path d="m6 6 12 12M18 6 6 18" /> : kind === 'video' ? <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m10 9 5 3-5 3Z" /></> : kind === 'cover' ? <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></> : <><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="8" cy="9" r="1.5" /><path d="m4 17 5-5 4 4 3-3 5 5" /></>}
  </svg>;
}

function sizeLabel(file) {
  if (!file) return '';
  if (file.size < MB) return `${Math.ceil(file.size / 1024).toLocaleString('pt-BR')} KB`;
  return `${(file.size / MB).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

export default function PostMediaPicker({ items = EMPTY_ITEMS, onChange, disabled = false }) {
  const inputRef = useRef(null);
  const [previews, setPreviews] = useState([]);
  const [error, setError] = useState('');
  const hintId = useId();
  const errorId = useId();
  const images = items.filter((item) => item.kind === 'image');
  const videos = items.filter((item) => item.kind === 'video');
  const coverIndex = items.findIndex((item) => item.kind === 'image');
  const full = images.length >= 8 && videos.length >= 2;

  useEffect(() => {
    const next = items.map((item) => item.file ? URL.createObjectURL(item.file) : item.url || '');
    setPreviews(next);
    return () => next.forEach((url, index) => {
      if (items[index].file) URL.revokeObjectURL(url);
    });
  }, [items]);

  function addFiles(event) {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = '';
    if (disabled || !files.length) return;
    const additions = [];
    for (const file of files) {
      const mimeType = file.type.toLowerCase();
      const kind = IMAGE_TYPES.has(mimeType) ? 'image' : VIDEO_TYPES.has(mimeType) ? 'video' : null;
      if (!kind) {
        setError(`“${file.name}” não é um formato aceito. Use JPG, PNG, GIF, WebP ou AVIF para fotos, e MP4 ou WebM para vídeos.`);
        return;
      }
      const limit = kind === 'image' ? 5 : 50;
      if (file.size > limit * MB) {
        setError(`“${file.name}” ultrapassa o limite de ${limit} MB ${kind === 'image' ? 'por foto' : 'por vídeo'}.`);
        return;
      }
      additions.push({ file, kind, mimeType });
    }
    if (images.length + additions.filter((item) => item.kind === 'image').length > 8) {
      setError('Você pode adicionar até 8 fotos. Remova uma foto antes de selecionar outras.');
      return;
    }
    if (videos.length + additions.filter((item) => item.kind === 'video').length > 2) {
      setError('Você pode adicionar até 2 vídeos. Remova um vídeo antes de selecionar outros.');
      return;
    }
    setError('');
    onChange([...items, ...additions]);
  }

  function remove(index) {
    setError('');
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }

  function setCover(index) {
    const next = [...items];
    const [cover] = next.splice(index, 1);
    setError('');
    onChange([cover, ...next]);
  }

  const pickerDescription = `${hintId}${error ? ` ${errorId}` : ''}`;
  return <div className="post-media-picker" aria-busy={disabled}>
    <input ref={inputRef} className="post-media-file-input" type="file" multiple accept={ACCEPT} onChange={addFiles} disabled={disabled || full} aria-label="Selecionar fotos e vídeos" aria-describedby={pickerDescription} />
    {!items.length ? <button type="button" className="post-media-dropzone" onClick={() => inputRef.current?.click()} disabled={disabled} aria-label="Adicionar fotos e vídeos" aria-describedby={pickerDescription}>
      <span className="post-media-dropzone-icon"><MediaIcon kind="image" /></span>
      <strong>Adicionar fotos e vídeos</strong>
      <span>Mostre os detalhes e o estado do seu item.</span>
      <span className="post-media-format-tags"><span>Fotos até 5 MB</span><span>Vídeos até 50 MB</span></span>
    </button> : <>
      <div className={`post-media-grid${items.length === 1 ? ' is-single' : ''}`}>
        {items.map((item, index) => {
          const isImage = item.kind === 'image';
          const number = items.slice(0, index + 1).filter((entry) => entry.kind === item.kind).length;
          const label = `${isImage ? 'foto' : 'vídeo'} ${number}`;
          const isCover = isImage && index === coverIndex;
          return <article className={`post-media-card${isCover ? ' is-cover' : ''}`} key={item.url || `${item.file?.name}-${item.file?.lastModified}-${index}`}>
            <div className="post-media-visual">
              {isImage ? <img src={previews[index] || undefined} alt={`Prévia da ${label}`} /> : <video src={previews[index] || undefined} controls playsInline preload="metadata" aria-label={`Prévia do ${label}`}>Seu navegador não conseguiu reproduzir este vídeo.</video>}
              <span className={isCover ? 'post-media-badge is-cover' : 'post-media-badge'}><MediaIcon kind={isCover ? 'cover' : item.kind} />{isCover ? 'Capa do anúncio' : isImage ? `Foto ${number}` : `Vídeo ${number}`}</span>
              <button type="button" className="post-media-remove" onClick={() => remove(index)} disabled={disabled} aria-label={`Remover ${label}`} title={`Remover ${label}`}><MediaIcon kind="close" /></button>
            </div>
            <div className="post-media-card-footer">
              <span title={item.file?.name || (isImage ? 'Foto do anúncio' : 'Vídeo do anúncio')}>{item.file?.name || (isImage ? 'Foto do anúncio' : 'Vídeo do anúncio')}{item.file && <small>{sizeLabel(item.file)}</small>}</span>
              {isImage && !isCover && <button type="button" className="post-media-set-cover" onClick={() => setCover(index)} disabled={disabled}>Usar como capa</button>}
            </div>
          </article>;
        })}
      </div>
      <div className="post-media-toolbar">
        <button type="button" className="ghost-btn post-media-add" onClick={() => inputRef.current?.click()} disabled={disabled || full} aria-describedby={pickerDescription}><MediaIcon kind="image" />Adicionar fotos e vídeos</button>
        <span className="post-media-counter">{images.length}/8 fotos · {videos.length}/2 vídeos</span>
      </div>
    </>}
    <p className="post-media-hint" id={hintId}>Até 8 fotos (JPG, PNG, GIF, WebP ou AVIF, 5 MB cada) e 2 vídeos (MP4 ou WebM, 50 MB cada). {images.length ? 'A primeira foto será a capa do anúncio.' : 'Você também pode publicar apenas com vídeo.'}</p>
    {error && <p className="post-media-error" id={errorId} role="alert">{error}</p>}
  </div>;
}
