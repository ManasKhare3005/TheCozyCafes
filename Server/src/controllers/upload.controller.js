import cloudinary from '../lib/cloudinary.js';

function getMediaType(mimetype) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  return 'file';
}

function looksLikeSvg(buffer) {
  const prefix = buffer.subarray(0, 512).toString('utf8').trimStart().toLowerCase();
  return prefix.startsWith('<svg') || prefix.startsWith('<?xml') || prefix.includes('<svg');
}

function getUploadModerationKind(mediaType) {
  if (mediaType !== 'image') return null;
  const configured = process.env.CLOUDINARY_UPLOAD_MODERATION?.trim();
  return configured || null;
}

function getModerationStatus(result) {
  const entries = Array.isArray(result?.moderation) ? result.moderation : [];
  if (entries.some((entry) => entry?.status === 'rejected')) return 'rejected';
  if (entries.some((entry) => entry?.status === 'approved')) return 'approved';
  if (entries.some((entry) => entry?.status === 'pending')) return 'pending';
  return null;
}

async function destroyRejectedUpload(result) {
  if (!result?.public_id) return;
  try {
    await cloudinary.uploader.destroy(result.public_id, {
      resource_type: result.resource_type || 'image',
    });
  } catch (error) {
    console.error('Failed to destroy rejected upload:', error);
  }
}

function deliveryUrl(result, mediaType) {
  if (mediaType !== 'image' || !result?.public_id) return result?.secure_url;
  return cloudinary.url(result.public_id, {
    secure: true,
    resource_type: result.resource_type || 'image',
    transformation: [
      { quality: 'auto', fetch_format: 'auto' },
    ],
  });
}

export async function uploadMedia(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    if (looksLikeSvg(req.file.buffer)) {
      return res.status(400).json({ error: 'SVG uploads are not allowed' });
    }

    const mediaType = getMediaType(req.file.mimetype);

    // Upload to Cloudinary from buffer
    const result = await new Promise((resolve, reject) => {
      const uploadOptions = {
        folder: 'chatroom',
        resource_type: 'auto', // auto-detect image/video/raw
      };

      // Add image-specific optimizations
      if (mediaType === 'image') {
        uploadOptions.transformation = [
          { quality: 'auto', fetch_format: 'auto' },
        ];
        const moderationKind = getUploadModerationKind(mediaType);
        if (moderationKind) {
          uploadOptions.moderation = moderationKind;
        }
      }

      const stream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      stream.end(req.file.buffer);
    });

    const moderationStatus = getModerationStatus(result);
    if (moderationStatus === 'rejected') {
      await destroyRejectedUpload(result);
      return res.status(400).json({ error: 'Image did not pass moderation review' });
    }

    res.json({
      url: deliveryUrl(result, mediaType),
      mediaType,
      mediaName: req.file.originalname?.slice(0, 255) || 'upload',
      publicId: result.public_id,
      moderationStatus,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
}
