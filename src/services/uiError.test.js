import { getUiErrorMessage, sanitizeUiText } from './uiError';

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('sanitizes object payloads before rendering UI errors', () => {
  expect(sanitizeUiText({ error: { message: 'Code invalide' } })).toBe('Code invalide');
});

test('hides object stringification and backend hints from UI errors', () => {
  expect(sanitizeUiText('[object Object]', 'Action impossible')).toBe('Action impossible');
  expect(
    sanitizeUiText('Reponse HTML recue. Verifiez API_BASE / proxy backend', 'Action impossible')
  ).toBe('Action impossible');
});

test('uses safe status messages for common API failures', () => {
  expect(getUiErrorMessage({ status: 403, message: 'permission_missing' })).toBe('Acces refuse.');
  expect(getUiErrorMessage({ status: 500, message: { detail: 'mongodb stack trace' } }, 'Erreur de chargement')).toBe('Erreur de chargement');
});
