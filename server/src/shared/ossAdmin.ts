import OSS from 'ali-oss';
import { config } from '../config.js';

let client: OSS | null = null;
export function ossAdmin(): OSS {
  if (!client) {
    client = new OSS({
      region: config.oss.region,
      bucket: config.oss.bucket,
      accessKeyId: config.oss.accessKeyId,
      accessKeySecret: config.oss.accessKeySecret,
      secure: true,
    });
  }
  return client;
}
