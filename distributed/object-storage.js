const { CreateBucketCommand, DeleteObjectCommand, HeadBucketCommand, PutBucketPolicyCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

function createObjectStorage({ bucket, endpoint, publicBaseUrl, region, accessKeyId, secretAccessKey, forcePathStyle = false }) {
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) return null;
  const isR2 = new URL(endpoint).hostname.endsWith('.r2.cloudflarestorage.com');
  if (isR2 && !publicBaseUrl) {
    throw new Error('Cloudflare R2 requires S3_PUBLIC_BASE_URL (r2.dev or a public custom domain) to serve uploaded images.');
  }
  const imageBaseUrl = publicBaseUrl || endpoint;
  const publicUrl = new URL(imageBaseUrl);
  if (!['http:', 'https:'].includes(publicUrl.protocol) || (isR2 && publicUrl.hostname.endsWith('.r2.cloudflarestorage.com'))) {
    throw new Error('S3_PUBLIC_BASE_URL must point to the public image domain, not the R2 S3 API endpoint.');
  }
  const client = new S3Client({
    endpoint,
    region: region || (isR2 ? 'auto' : 'us-east-1'),
    forcePathStyle,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: { accessKeyId, secretAccessKey }
  });

  return {
    async ensureBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch (error) {
        if (error?.$metadata?.httpStatusCode !== 404 && error?.name !== 'NotFound' && error?.name !== 'NoSuchBucket') throw error;
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
      }
      // R2 manages public access through a custom domain or r2.dev. It does
      // not implement S3 bucket policies; do not send an unsupported request.
      if (isR2) {
        console.info('[object-storage] Cloudflare R2: bucket access verified; public access is managed in Cloudflare.');
        return;
      }
      try {
        await client.send(new PutBucketPolicyCommand({
          Bucket: bucket,
          Policy: JSON.stringify({
            Version: '2012-10-17',
            Statement: [{
              Effect: 'Allow',
              Principal: '*',
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${bucket}/*`]
            }]
          })
        }));
      } catch (error) {
        const statusCode = error?.$metadata?.httpStatusCode ?? error?.statusCode;
        const isNotImplemented = statusCode === 501
          || error?.name === 'NotImplemented'
          || error?.Code === 'NotImplemented';
        if (!isNotImplemented) throw error;
        console.info('[object-storage] This provider manages public access outside S3 bucket policies; configure its public image domain.');
      }
    },
    async put({ key, body, contentType, contentLength }) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, ...(contentLength === undefined ? {} : { ContentLength: contentLength }) }));
      return `${imageBaseUrl.replace(/\/$/, '')}/${encodeURIComponent(key).replace(/%2F/g, '/')}`;
    },
    async remove({ key }) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    }
  };
}

module.exports = { createObjectStorage };
