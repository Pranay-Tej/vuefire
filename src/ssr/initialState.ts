import { FirebaseApp } from 'firebase/app'
import { DatabaseReference, Query as DatabaseQuery } from 'firebase/database'
import {
  CollectionReference,
  DocumentReference,
  Query as FirestoreQuery,
} from 'firebase/firestore'
import { StorageReference } from 'firebase/storage'
import { InjectionKey } from 'vue-demi'
import { useFirebaseApp } from '../app'
import {
  isDatabaseReference,
  isFirestoreDataReference,
  isFirestoreQuery,
  isStorageReference,
  _FirestoreDataSource,
  _Nullable,
} from '../shared'

export interface SSRStore {
  // firestore data
  f: Record<string, unknown>
  // rtdb data
  r: Record<string, unknown>

  // storage urls and metadata
  s: Record<string, string>

  // auth user
  u: Record<string, unknown>
}

// @internal
const initialStatesMap = new WeakMap<FirebaseApp, SSRStore>()

/**
 * Allows getting the initial state set during SSR on the client.
 *
 * @param initialState - the initial state to set for the firebase app during SSR. Pass undefined to not set it
 * @param firebaseApp - the firebase app to get the initial state for
 * @returns the initial states for the current firebaseApp
 */
export function useSSRInitialState(
  initialState?: SSRStore,
  firebaseApp: FirebaseApp = useFirebaseApp()
): SSRStore {
  // get initial state based on the current firebase app
  if (!initialStatesMap.has(firebaseApp)) {
    initialStatesMap.set(
      firebaseApp,
      initialState || { f: {}, r: {}, s: {}, u: {} }
    )
  }

  return initialStatesMap.get(firebaseApp)!
}

export function getInitialValue(
  dataSource: _Nullable<
    _FirestoreDataSource | DatabaseReference | DatabaseQuery | StorageReference
  >,
  ssrKey: string | undefined,
  fallbackValue: unknown
) {
  if (!dataSource) return fallbackValue

  const [sourceType, path] = getDataSourceInfo(dataSource)
  if (!sourceType) return fallbackValue

  const initialState: Record<string, unknown> =
    useSSRInitialState()[sourceType] || {}
  const key = ssrKey || path

  // TODO: warn for queries on the client if there are other keys and this is during hydration

  // returns the fallback value if no key, otherwise initial state
  return key && key in initialState ? initialState[key] : fallbackValue
}

export function deferInitialValueSetup(
  dataSource: _Nullable<
    _FirestoreDataSource | DatabaseReference | DatabaseQuery | StorageReference
  >,
  ssrKey: string | undefined | null,
  promise: Promise<unknown>
) {
  if (!dataSource) return

  const [sourceType, path] = getDataSourceInfo(dataSource)
  if (!sourceType) return

  const initialState: Record<string, unknown> = useSSRInitialState()[sourceType]
  const key = ssrKey || path

  if (key) {
    promise.then((value) => {
      initialState[key] = value
    })
    return key
  }
}

function getDataSourceInfo(
  dataSource:
    | _FirestoreDataSource
    | DatabaseReference
    | DatabaseQuery
    | StorageReference
) {
  return isFirestoreDataReference(dataSource) || isFirestoreQuery(dataSource)
    ? (['f', dataSource.path] as const)
    : isDatabaseReference(dataSource)
    ? (['r', dataSource.toString()] as const)
    : isStorageReference(dataSource)
    ? (['s', dataSource.toString()] as const)
    : []
}
