import type { LibraryType } from '@/api/resourceCenter';

const resourceLibraryPaths: Record<LibraryType, string> = {
  project: '/asset-center/projects',
  content_archive: '/asset-center/resources?library_type=content_archive',
  knowledge: '/asset-center/knowledge',
  media: '/asset-center/media',
};

export function getResourceLibraryPath(libraryType: LibraryType) {
  return resourceLibraryPaths[libraryType];
}

export function getResourceDetailPath(id: number, libraryType: LibraryType, edit = false) {
  const params = new URLSearchParams({ library_type: libraryType });
  if (edit) params.set('edit', '1');
  return `/asset-center/resources/${id}?${params.toString()}`;
}
