/// <reference types="svelte" />
import App from './App.svelte';

const app = new App({
  target: document.getElementById('container')!,
});

export default app;
