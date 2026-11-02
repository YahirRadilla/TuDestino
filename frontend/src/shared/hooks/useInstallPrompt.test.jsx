import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInstallPrompt, INSTALL_DISMISSED_KEY } from './useInstallPrompt.js';

function fireBeforeInstallPrompt(outcome = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

describe('useInstallPrompt', () => {
  beforeEach(() => localStorage.clear());

  it('is not installable until beforeinstallprompt fires', () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canInstall).toBe(false);
    const event = fireBeforeInstallPrompt();
    expect(event.defaultPrevented).toBe(true);
    expect(result.current.canInstall).toBe(true);
  });

  it('install() shows the native prompt and clears it', async () => {
    const { result } = renderHook(() => useInstallPrompt());
    const event = fireBeforeInstallPrompt('accepted');
    await act(async () => {
      await result.current.install();
    });
    expect(event.prompt).toHaveBeenCalled();
    expect(result.current.canInstall).toBe(false);
  });

  it('dismiss() hides the prompt and persists the choice', () => {
    const { result } = renderHook(() => useInstallPrompt());
    fireBeforeInstallPrompt();
    act(() => result.current.dismiss());
    expect(result.current.canInstall).toBe(false);
    expect(localStorage.getItem(INSTALL_DISMISSED_KEY)).toBe('1');
  });

  it('respects a previous dismissal', () => {
    localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
    const { result } = renderHook(() => useInstallPrompt());
    fireBeforeInstallPrompt();
    expect(result.current.canInstall).toBe(false);
    expect(result.current.dismissed).toBe(true);
  });

  it('marks the app as installed on appinstalled', () => {
    const { result } = renderHook(() => useInstallPrompt());
    fireBeforeInstallPrompt();
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(result.current.isInstalled).toBe(true);
    expect(result.current.canInstall).toBe(false);
  });
});
