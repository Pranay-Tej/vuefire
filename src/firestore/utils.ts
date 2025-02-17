import {
  Query,
  DocumentReference,
  CollectionReference,
  DocumentData,
  GeoPoint,
  FirestoreDataConverter,
  Timestamp,
} from 'firebase/firestore'
import { isObject, isDocumentRef, TODO } from '../shared'
import { VueFirestoreDocumentData } from '.'

export type FirestoreReference = Query | DocumentReference | CollectionReference

/**
 * Default converter for Firestore data. Can be overridden by setting the
 */
export const firestoreDefaultConverter: FirestoreDataConverter<VueFirestoreDocumentData> =
  {
    toFirestore(data) {
      // this is okay because we declare other properties as non-enumerable
      return data as DocumentData
    },
    fromFirestore(snapshot, options) {
      return snapshot.exists()
        ? (Object.defineProperties(snapshot.data(options)!, {
            id: { value: snapshot.id },
            // TODO: check if worth adding or should be through an option
            // $meta: {
            //   value: snapshot.metadata,
            // },
            // $ref: { get: () => snapshot.ref },
          }) as VueFirestoreDocumentData)
        : null
    },
  }

export function extractRefs(
  // TODO: should be unknown instead of DocumentData
  doc: DocumentData,
  oldDoc: DocumentData | void,
  subs: Record<string, { path: string; data: () => DocumentData | null }>
): [DocumentData, Record<string, DocumentReference>] {
  if (!isObject(doc)) return [doc, {}]

  const dataAndRefs: [DocumentData, Record<string, DocumentReference>] = [
    {},
    {},
  ]

  const subsByPath = Object.keys(subs).reduce((resultSubs, subKey) => {
    const sub = subs[subKey]
    resultSubs[sub.path] = sub.data()
    return resultSubs
  }, {} as Record<string, DocumentData | null>)

  function recursiveExtract(
    doc: DocumentData,
    oldDoc: DocumentData | void,
    path: string,
    result: [DocumentData, Record<string, DocumentReference>]
  ): void {
    // make it easier to later on access the value
    oldDoc = oldDoc || {}
    const [data, refs] = result
    // Add all properties that are not enumerable (not visible in the for loop)
    // getOwnPropertyDescriptors does not exist on IE
    Object.getOwnPropertyNames(doc).forEach((propertyName) => {
      const descriptor = Object.getOwnPropertyDescriptor(doc, propertyName)
      if (descriptor && !descriptor.enumerable) {
        Object.defineProperty(data, propertyName, descriptor)
      }
    })

    // recursively traverse doc to copy values and extract references
    for (const key in doc) {
      const ref: unknown = doc[key]
      if (
        // primitives
        ref == null ||
        // TODO: check and remove
        // Firestore < 4.13
        ref instanceof Date ||
        ref instanceof Timestamp ||
        // TODO: same?
        isGeoPoint(ref)
      ) {
        data[key] = ref
      } else if (isDocumentRef(ref)) {
        // allow values to be null (like non-existent refs)
        // TODO: better typing since this isObject shouldn't be necessary but it doesn't work
        data[key] =
          typeof oldDoc === 'object' &&
          key in oldDoc &&
          // only copy refs if they were refs before
          // https://github.com/vuejs/vuefire/issues/831
          typeof oldDoc[key] != 'string'
            ? oldDoc[key]
            : ref.path
        // TODO: handle subpathes?
        refs[path + key] = ref
      } else if (Array.isArray(ref)) {
        data[key] = Array(ref.length)
        // fill existing refs into data but leave the rest empty
        for (let i = 0; i < ref.length; i++) {
          const newRef: TODO = ref[i]
          // TODO: this only works with array of primitives but not with nested properties like objects with References
          if (newRef && newRef.path in subsByPath)
            data[key][i] = subsByPath[newRef.path]
        }
        // the oldArray is in this case the same array with holes unless the array already existed
        recursiveExtract(ref, oldDoc[key] || data[key], path + key + '.', [
          data[key],
          refs,
        ])
      } else if (isObject(ref)) {
        data[key] = {}
        recursiveExtract(ref, oldDoc[key], path + key + '.', [data[key], refs])
      } else {
        data[key] = ref
      }
    }
  }

  recursiveExtract(doc, oldDoc, '', dataAndRefs)

  return dataAndRefs
}

function isGeoPoint(value: unknown): value is GeoPoint {
  return isObject(value) && 'latitude' in value && 'longitude' in value
}
