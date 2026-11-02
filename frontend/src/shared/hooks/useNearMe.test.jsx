import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useNearMe } from './useNearMe.js';

afterEach(() => vi.unstubAllGlobals());

const stubGeolocation = (getCurrentPosition) =>
  vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } });

describe('useNearMe', () => {
  it('starts idle with no coordinates', () => {
    stubGeolocation(vi.fn());
    const { result } = renderHook(() => useNearMe());
    expect(result.current).toMatchObject({ status: 'idle', coords: null });
  });

  it('reports "unsupported" when the Geolocation API is missing', () => {
    vi.stubGlobal('navigator', { ...navigator, geolocation: undefined });
    const { result } = renderHook(() => useNearMe());
    act(() => result.current.request());
    expect(result.current.status).toBe('unsupported');
  });

  it('exposes rounded coordinates once the position is granted', () => {
    stubGeolocation((success) => success({ coords: { latitude: 24.142345, longitude: -110.312345 } }));
    const { result } = renderHook(() => useNearMe());
    act(() => result.current.request());
    expect(result.current).toMatchObject({
      status: 'active',
      coords: { lat: 24.1423, lng: -110.3123 },
    });
  });

  it('reports "denied" when the user rejects the permission', () => {
    stubGeolocation((_success, failure) => failure({ code: 1 }));
    const { result } = renderHook(() => useNearMe());
    act(() => result.current.request());
    expect(result.current).toMatchObject({ status: 'denied', coords: null });
  });

  it('reports a generic "error" for other failures', () => {
    stubGeolocation((_success, failure) => failure({ code: 2 }));
    const { result } = renderHook(() => useNearMe());
    act(() => result.current.request());
    expect(result.current.status).toBe('error');
  });

  it('clear() returns to idle', () => {
    stubGeolocation((success) => success({ coords: { latitude: 24, longitude: -110 } }));
    const { result } = renderHook(() => useNearMe());
    act(() => result.current.request());
    act(() => result.current.clear());
    expect(result.current).toMatchObject({ status: 'idle', coords: null });
  });
});
