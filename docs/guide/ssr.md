# Server Side Rendering (SSR)

<!-- NOTE: hide until it works -->
<!-- :::tip
If you are using Nuxt.js, read the [Nuxt guide](./nuxt.md) instead, most of the things are already configured for you.
::: -->

When doing SSR (Server Side Rendering) you want to wait for the data on the server to serialize it and retrieve it on the client side where it will displayed. VueFire already waits for the data for you if you use the composables within components:

<FirebaseExample>

```vue
<script setup>
import { ref as dbRef } from 'firebase/database'
import { useObject, useDatabase } from 'vuefire'

const db = useDatabase()
// automatically waits for the data to be loaded on the server
const quizResults = useObject(dbRef(db, 'quizzes/' + quizId))
</script>
```

```vue
<script setup>
import { doc, getDoc } from 'firebase/firestore'
import { useDocument, useFirestore } from 'vuefire'

const db = useFirestore()
// automatically waits for the data to be loaded on the server
const quizResults = useDocument(doc(db, 'quizzes', quizId))
</script>
```

</FirebaseExample>

You only need to escape and serialize the data to the client and handle state hydration. This depends on what you are using to do SSR but should look similar to this example using [the Vitesse template](https://github.com/antfu/vitesse):

Add a `src/modules/vuefire.ts` (or `.js`) file:

```ts
// src/modules/vuefire.ts
import { initializeApp } from 'firebase/app'
import { VueFire useSSRInitialState } from 'vuefire'
import type { UserModule } from '~/types'

export const install: UserModule = ({ isClient, initialState, app }) => {
  const firebaseApp = initializeApp({
    // your config
  })

  app.use(VueFire, { firebaseApp })

  if (isClient) {
    // reuse the initial state on the client
    useSSRInitialState(initialState.vuefire, firebaseApp)
  } else {
    // on the server we ensure all the data is retrieved in this object
    initialState.vuefire = useSSRInitialState()
  }
}
```

Note that by default, vite-ssg (used by Vitesse) uses `JSON.stringify()` to serialize the state, which is faster but doesn't support some values like `Date` objects and also exposes your application to some attacks **if your data comes from the user**. You can use a custom `transformState` function to handle this:

```ts
// src/main.ts
import devalue from '@nuxt/devalue'
import { ViteSSG } from 'vite-ssg'
import App from './App.vue'

export const createApp = ViteSSG(
  App,
  { routes },
  ({ app, router, initialState }) => {
    // ...
  },
  {
    transformState(state) {
      return import.meta.env.SSR ? devalue(state) : state
    },
  },
)
```

Web Security is a broad topic that we cannot cover here. We recommend you to read these resources to dive deeper:

- [State Serialization in vite-ssg](https://github.com/antfu/vite-ssg#state-serialization)
- [SSR Best practices for Vue.js](https://vuejs.org/guide/best-practices/security.html#server-side-rendering-ssr)

## Usage outside of components

If you are using VueFire composables outside of components, e.g. using `useDocument()` within a [Pinia](https://pinia.vuejs.org) store, you need to manually wait for the data to be loaded on the server as VueFire cannot call `onServerPrefetch()` for you. This means you also need to [use `<Suspense>`](https://vuejs.org/guide/built-ins/suspense.html#suspense) to be able to use `await` within `setup()`. VueFire exposes a function to retrieve all pending promises created by the different composables (`useDocument()`, `useObject()`, etc). Await it inside of **any component that uses the data**:

```vue
<script setup>
import { useQuizStore } from '~/stores/quiz'
import { usePendingPromises } from 'vuefire'

// this store internally calls `useDocument()` when created
const quizStore = useQuizStore()

// since `useDocument()` has been called 
await usePendingPromises()
</script>
```

## Exclude from hydration

You can exclude data from hydration by passing `false` to the `ssrKey` option:

```ts
useDocument(..., { ssrKey: false })
useList(..., { ssrKey: false })
// etc
```

<!-- TODO: I wonder if we could attach effect scopes to applications so `onServerPrefetch()` is still awaited when attached -->

<!-- 

## Vue Router Data Loaders

Get the data once only on server

```vue
<script lang="ts">
export const useUserList = defineLoader(async () => {
  const { data: users, promise } = useCollection(collection(db, 'users'), { once: true })
  await promise.value
  // or
  // const users = await useCollectionOnce(collection(db, 'users'))
  return users
})
</script>

<script setup lang="ts">
const { data: users } = useUserList()
</script>
```

-->
