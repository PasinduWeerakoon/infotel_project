/**
 * Image picker that uploads straight to storage and returns the stored key.
 * PNG, JPG, WebP or SVG up to 2 MB, checked here and again by the server.
 */
import { IconPhotoUp } from '@tabler/icons-react';
import { App, Button, Flex, Image, Upload } from 'antd';
import { useState } from 'react';
import { uploadImage } from '../api/platform';

const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const MAX_BYTES = 2 * 1024 * 1024;

interface ImageUploadProps {
  purpose: 'logo' | 'prize';
  imageUrl: string | null;
  onUploaded: (key: string, publicUrl: string) => void;
  size?: number;
}

export function ImageUpload({ purpose, imageUrl, onUploaded, size = 96 }: ImageUploadProps) {
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(false);

  return (
    <Flex align="center" gap={16} wrap>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 12,
          background: '#f4f4f5',
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
          border: '1px solid #e4e4e7',
          flex: 'none',
        }}
      >
        {imageUrl ? (
          <Image src={imageUrl} width={size} height={size} style={{ objectFit: 'contain' }} preview={false} />
        ) : (
          <IconPhotoUp size={28} color="#a1a1aa" stroke={1.5} />
        )}
      </div>
      <Upload
        accept={TYPES.join(',')}
        showUploadList={false}
        beforeUpload={(file) => {
          if (!TYPES.includes(file.type)) {
            message.error('Use a PNG, JPG, WebP or SVG image');
            return Upload.LIST_IGNORE;
          }
          if (file.size > MAX_BYTES) {
            message.error('Images must be 2 MB or smaller');
            return Upload.LIST_IGNORE;
          }
          return true;
        }}
        customRequest={async ({ file, onSuccess, onError }) => {
          setUploading(true);
          try {
            const result = await uploadImage(file as File, purpose);
            onUploaded(result.key, result.publicUrl);
            onSuccess?.(result);
          } catch (error) {
            message.error('Upload failed. Please try again');
            onError?.(error as Error);
          } finally {
            setUploading(false);
          }
        }}
      >
        <Button loading={uploading}>{imageUrl ? 'Replace image' : 'Upload image'}</Button>
      </Upload>
    </Flex>
  );
}
