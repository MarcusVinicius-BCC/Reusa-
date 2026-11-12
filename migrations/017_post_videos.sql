CREATE TABLE IF NOT EXISTS post_videos (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('video/mp4', 'video/webm')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS post_videos_post_order_idx
  ON post_videos(post_id, sort_order);
