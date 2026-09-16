import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest `globals: false` ile çalıştığı için Testing Library kendi otomatik temizliğini
// kuramaz; kurmazsak DOM testler arasında birikir ve sorgular "birden çok eşleşme" verir.
afterEach(cleanup);
