# Tranzmit Exit Interview SDK

Drop-in SDK that intercepts your cancel button, opens an AI exit interview modal, and handles everything.

## Quick Start

### 1. You have a cancel button somewhere on your site

```html
<button id="cancel-btn">Cancel Subscription</button>
```

### 2. Add one script tag

```html
<script
  src="https://tranzmit-button-sdk-react-app.vercel.app/embed.js"
  data-api-key="YOUR_API_KEY"
  data-attach="#cancel-btn"
  data-backend-url="https://tranzmit-button-sdk-react-app.vercel.app"
></script>
```

Done. The SDK finds your button, intercepts the click, and opens the exit interview modal.

---

## Configuration

| Attribute | Required | Description |
|-----------|----------|-------------|
| `data-api-key` | Yes | Your Tranzmit API key |
| `data-attach` | Yes | CSS selector of your existing cancel button |
| `data-backend-url` | Yes | Set to `https://tranzmit-button-sdk-react-app.vercel.app` |

### Selector Examples

| Your button HTML | `data-attach` value |
|---|---|
| `<button id="cancel-btn">` | `#cancel-btn` |
| `<button class="cancel-subscription">` | `.cancel-subscription` |
| `<a href="/cancel">` | `a[href="/cancel"]` |
| `<button data-action="cancel">` | `[data-action="cancel"]` |

---

## Framework Guides

### HTML / Static Sites

Add the script tag before `</body>`:

```html
<!DOCTYPE html>
<html>
<body>
  <button id="cancel-btn">Cancel Subscription</button>

  <script
    src="https://tranzmit-button-sdk-react-app.vercel.app/embed.js"
    data-api-key="YOUR_API_KEY"
    data-attach="#cancel-btn"
    data-backend-url="https://tranzmit-button-sdk-react-app.vercel.app"
  ></script>
</body>
</html>
```

---

### React

Use `useEffect` to load the script after your component mounts:

```jsx
import { useEffect } from 'react';

function SettingsPage() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://tranzmit-button-sdk-react-app.vercel.app/embed.js';
    script.setAttribute('data-api-key', 'YOUR_API_KEY');
    script.setAttribute('data-attach', '#cancel-btn');
    script.setAttribute('data-backend-url', 'https://tranzmit-button-sdk-react-app.vercel.app');
    document.body.appendChild(script);
    return () => document.body.removeChild(script);
  }, []);

  return <button id="cancel-btn">Cancel Subscription</button>;
}
```

---

### Next.js

Use the `next/script` component with `lazyOnload` strategy:

```jsx
import Script from 'next/script';

export default function SettingsPage() {
  return (
    <>
      <button id="cancel-btn">Cancel Subscription</button>

      <Script
        src="https://tranzmit-button-sdk-react-app.vercel.app/embed.js"
        data-api-key="YOUR_API_KEY"
        data-attach="#cancel-btn"
        data-backend-url="https://tranzmit-button-sdk-react-app.vercel.app"
        strategy="lazyOnload"
      />
    </>
  );
}
```

---

### Vue

Load the script in `onMounted`:

```vue
<template>
  <button id="cancel-btn">Cancel Subscription</button>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue';

let script;

onMounted(() => {
  script = document.createElement('script');
  script.src = 'https://tranzmit-button-sdk-react-app.vercel.app/embed.js';
  script.setAttribute('data-api-key', 'YOUR_API_KEY');
  script.setAttribute('data-attach', '#cancel-btn');
  script.setAttribute('data-backend-url', 'https://tranzmit-button-sdk-react-app.vercel.app');
  document.body.appendChild(script);
});

onUnmounted(() => {
  if (script) document.body.removeChild(script);
});
</script>
```

---

### Nuxt

Use the `useHead` composable:

```vue
<template>
  <button id="cancel-btn">Cancel Subscription</button>
</template>

<script setup>
useHead({
  script: [
    {
      src: 'https://tranzmit-button-sdk-react-app.vercel.app/embed.js',
      'data-api-key': 'YOUR_API_KEY',
      'data-attach': '#cancel-btn',
      'data-backend-url': 'https://tranzmit-button-sdk-react-app.vercel.app',
      defer: true,
    },
  ],
});
</script>
```

---

### Angular

Load the script in `ngAfterViewInit`:

```typescript
import { Component, AfterViewInit, OnDestroy } from '@angular/core';

@Component({
  template: `<button id="cancel-btn">Cancel Subscription</button>`,
})
export class SettingsComponent implements AfterViewInit, OnDestroy {
  private script: HTMLScriptElement | null = null;

  ngAfterViewInit() {
    this.script = document.createElement('script');
    this.script.src = 'https://tranzmit-button-sdk-react-app.vercel.app/embed.js';
    this.script.setAttribute('data-api-key', 'YOUR_API_KEY');
    this.script.setAttribute('data-attach', '#cancel-btn');
    this.script.setAttribute('data-backend-url', 'https://tranzmit-button-sdk-react-app.vercel.app');
    document.body.appendChild(this.script);
  }

  ngOnDestroy() {
    if (this.script) document.body.removeChild(this.script);
  }
}
```

---

### Svelte

Load the script in `onMount`:

```svelte
<script>
  import { onMount, onDestroy } from 'svelte';

  let script;

  onMount(() => {
    script = document.createElement('script');
    script.src = 'https://tranzmit-button-sdk-react-app.vercel.app/embed.js';
    script.setAttribute('data-api-key', 'YOUR_API_KEY');
    script.setAttribute('data-attach', '#cancel-btn');
    script.setAttribute('data-backend-url', 'https://tranzmit-button-sdk-react-app.vercel.app');
    document.body.appendChild(script);
  });

  onDestroy(() => {
    if (script) document.body.removeChild(script);
  });
</script>

<button id="cancel-btn">Cancel Subscription</button>
```

---

### WordPress

Add to your theme's `footer.php` before `</body>`, or use a plugin like "Insert Headers and Footers":

```html
<script
  src="https://tranzmit-button-sdk-react-app.vercel.app/embed.js"
  data-api-key="YOUR_API_KEY"
  data-attach="#cancel-btn"
  data-backend-url="https://tranzmit-button-sdk-react-app.vercel.app"
></script>
```

Make sure `data-attach` matches the CSS selector of your theme's cancel button.

---

### Shopify

Add to your theme's `theme.liquid` before `</body>`:

```html
<script
  src="https://tranzmit-button-sdk-react-app.vercel.app/embed.js"
  data-api-key="YOUR_API_KEY"
  data-attach=".cancel-subscription"
  data-backend-url="https://tranzmit-button-sdk-react-app.vercel.app"
></script>
```

---

### Webflow

Go to **Project Settings > Custom Code > Footer Code** and paste:

```html
<script
  src="https://tranzmit-button-sdk-react-app.vercel.app/embed.js"
  data-api-key="YOUR_API_KEY"
  data-attach="#cancel-btn"
  data-backend-url="https://tranzmit-button-sdk-react-app.vercel.app"
></script>
```

Give your cancel button the matching ID or class in the Webflow designer.

---

## How It Works

1. The SDK script loads on your page
2. It finds the element matching your `data-attach` selector
3. When clicked, it intercepts the default action and opens an AI-powered exit interview modal
4. The modal handles the conversation and retention flow automatically
5. No additional code needed on your end

## Support

Questions? Reach out to the Tranzmit team.
