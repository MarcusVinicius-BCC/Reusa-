import React, { useEffect, useMemo, useState } from 'react';
import './post-media-gallery.css';

const videoPlaceholder = '/media/video-placeholder.svg';

function PlayIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4Z" /></svg>;
}

function mediaFor(post) {
  const videos = (Array.isArray(post?.videos) ? post.videos : [])
    .filter((video) => video?.url)
    .map((video, index) => ({ kind: 'video', url: video.url, mimeType: video.mimeType || '', label: `Vídeo ${index + 1}`, key: `video:${video.url}` }));
  const photos = Array.isArray(post?.imageUrls) && post.imageUrls.length
    ? post.imageUrls
    : !videos.length && post?.imageUrl && post.imageUrl !== videoPlaceholder ? [post.imageUrl] : [];
  const images = photos.filter(Boolean).map((url, index) => ({ kind: 'image', url, label: `Foto ${index + 1}`, key: `image:${url}` }));
  return [...images, ...videos];
}

/** Pictures and videos share one viewer; existing image-only posts work unchanged. */
export default function PostMediaGallery({ post, variant = 'detail', onOpenPost }) {
  const media = useMemo(() => mediaFor(post), [post?.imageUrl, post?.imageUrls, post?.videos]);
  const [selection, setSelection] = useState({ postId: post?.id, key: '' });
  const [failedVideo, setFailedVideo] = useState('');
  const selected = (selection.postId === post?.id && media.find((item) => item.key === selection.key)) || media[0];
  const isFeed = variant === 'feed';
  const videos = media.filter((item) => item.kind === 'video');
  const cover = media.find((item) => item.kind === 'image')?.url || videoPlaceholder;

  useEffect(() => { setFailedVideo(''); }, [selected?.key]);

  function choose(item) {
    setSelection({ postId: post?.id, key: item.key });
  }

  function openVideo(event) {
    event.stopPropagation();
    if (onOpenPost) onOpenPost();
    else if (videos.length) choose(videos[0]);
  }

  if (!selected) return <div className={`post-media-gallery post-media-gallery--${variant} post-media-gallery--empty`}><img src={videoPlaceholder} alt="Mídia do anúncio indisponível" /></div>;

  return <div className={`post-media-gallery post-media-gallery--${variant}`}>
    <div className="post-media-stage">
      {selected.kind === 'video' ? <>
        <video key={selected.key} className={isFeed ? 'post-image post-media-video' : 'post-media-video'} controls playsInline preload="metadata" poster={cover} aria-label={`${selected.label}: ${post.title || 'item anunciado'}`} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} onError={() => setFailedVideo(selected.key)}>
          <source src={selected.url} type={selected.mimeType || undefined} />
          Seu navegador não consegue reproduzir este vídeo. <a href={selected.url}>Abrir vídeo</a>
        </video>
        {failedVideo === selected.key && <p className="post-media-playback-error" role="status">Não foi possível reproduzir este vídeo. <a href={selected.url} target="_blank" rel="noopener noreferrer">Abrir o arquivo</a></p>}
      </> : isFeed && onOpenPost ? <button type="button" className="post-media-open" onClick={onOpenPost} aria-label={`Ver anúncio: ${post.title || 'item anunciado'}`}><img className="post-image" src={selected.url} alt={post.title || 'Item anunciado'} loading="lazy" /></button> : <img className={isFeed ? 'post-image' : 'post-media-photo'} src={selected.url} alt={post.title || 'Item anunciado'} loading={isFeed ? 'lazy' : undefined} />}
      {isFeed && videos.length > 0 && selected.kind !== 'video' && <button type="button" className="post-media-video-link" onClick={openVideo} aria-label={`Ver ${videos.length === 1 ? 'vídeo' : `${videos.length} vídeos`} do anúncio`}><PlayIcon /><span>{videos.length === 1 ? 'Ver vídeo' : `${videos.length} vídeos`}</span></button>}
      {isFeed && media.length > 1 && videos.length === 0 && <span className="post-media-total" aria-label={`${media.length} fotos`}>{media.length} fotos</span>}
    </div>
    {!isFeed && media.length > 1 && <div className="post-media-thumbnails" role="group" aria-label="Fotos e vídeos do anúncio">
      {media.map((item) => <button type="button" key={item.key} className={`post-media-thumbnail${selected.key === item.key ? ' is-selected' : ''}${item.kind === 'video' ? ' is-video' : ''}`} aria-pressed={selected.key === item.key} aria-label={`Mostrar ${item.label.toLowerCase()}`} onClick={() => choose(item)}>
        {item.kind === 'image' ? <img src={item.url} alt="" loading="lazy" /> : <><PlayIcon /><span>{item.label}</span></>}
      </button>)}
    </div>}
  </div>;
}
