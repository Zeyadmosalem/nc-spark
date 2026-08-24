import { useQuery } from '@tanstack/react-query';
import { myLibrary } from '../api/library';

export const libraryKeys = { all: ['library'] };

export const useMyLibrary = () =>
  useQuery({ queryKey: libraryKeys.all, queryFn: myLibrary });
