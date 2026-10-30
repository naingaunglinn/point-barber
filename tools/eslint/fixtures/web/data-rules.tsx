// Must fail under packages/ui (spec rows 59, 62, 63): fetch, a second library, an inline queryKey and
// onMutate.
import axios from 'axios';
import { create } from 'zustand';

declare const useQuery: (options: object) => unknown;
declare const useMutation: (options: object) => unknown;

export const load = () => fetch('/api/v1/sales');
export const useSales = () => useQuery({ queryKey: ['sales'], queryFn: () => axios.get('/x') });
export const useSave = () => useMutation({ mutationFn: () => null, onMutate: () => null });
export const store = create;
