// Lớp hiện-một-lần dùng chung cho khối chữ của từng phần landing: trả thuộc tính `data-reveal` để landing.css
// ẩn khi 'waiting' và chạy `landing-rise` (static: chỉ opacity) khi 'entered'.
import type { RefObject } from 'react';
import { useOnceInView, type OnceInViewOptions, type OnceInViewState } from './useOnceInView';

export function useReveal<T extends Element>(
  ref: RefObject<T>,
  opts?: OnceInViewOptions,
): { 'data-reveal': OnceInViewState } {
  const state = useOnceInView(ref, opts);
  return { 'data-reveal': state };
}
