const { CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

function createObjectStorage({ bucket, endpoint, publicBaseUrl = endpoint, region = 'us-east-1', accessKeyId, secretAccessKey, forcePathStyle = false }) {
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) return null;
  const client = new S3Client({
    endpoint,
    region,
    forcePathStyle,
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
    },
    async put({ key, body, contentType }) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
      return `${publicBaseUrl.replace(/\/$/, '')}/${bucket}/${encodeURIComponent(key).replace(/%2F/g, '/')}`;
    }
  };
}

module.exports = { createObjectStorage };
