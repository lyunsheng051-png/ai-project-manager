const imageTypes: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif', svg: 'image/svg+xml',
};
export function imageMimeType(filename: string): string | undefined {
  const extension = filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return extension && Object.hasOwn(imageTypes, extension) ? imageTypes[extension] : undefined;
}
export const isImageFile = (filename: string) => Boolean(imageMimeType(filename));
