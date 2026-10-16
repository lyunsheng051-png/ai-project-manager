import type { FileEntry, ImagePreviewData } from '../../shared/contracts';

export interface FileDocument {
  id: number;
  entry: FileEntry;
  kind: 'text' | 'image';
  original: string;
  draft: string;
  image?: ImagePreviewData;
  loading: boolean;
  saving: boolean;
  error: string;
  loadId: number;
}
