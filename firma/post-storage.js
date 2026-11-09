import {
  db,
  doc,
  collection,
  setDoc,
  getDocs,
  getDoc,
  deleteDoc,
  writeBatch,
  ensureFirmyAdminSession,
} from './firebase.js?v=20';
import { normalizePostFrequency } from './post-frequency.mjs?v=1';
import { filterDeletedPostCollections, mergeDeletedPostTabs, mergePostRecords } from './post-state.mjs?v=2';

function currentIso() {
  return new Date().toISOString();
}

function defaultPostTabs(now = currentIso()) {
  const today = now.slice(0, 10);
  return [
    { id: 'google-posts', name: 'Wpisy Google', frequency: 'monthly', startDate: today, createdAt: now, updatedAt: now },
    { id: 'google-articles', name: 'Artykuly w Google', frequency: 'monthly', startDate: today, createdAt: now, updatedAt: now },
    { id: 'social-media', name: 'Media spolecznosciowe', frequency: 'weekly', startDate: today, createdAt: now, updatedAt: now },
  ];
}

function isPermissionError(error) {
  return String(error?.code || '').includes('permission-denied')
    || String(error?.message || '').toLowerCase().includes('permission')
    || String(error?.message || '').includes('Missing or insufficient permissions');
}

function normalizeTab(tab, now = currentIso()) {
  return {
    id: tab.id,
    firmId: tab.firmId || '',
    name: tab.name || 'Nowa podzakladka',
    frequency: normalizePostFrequency(tab.frequency),
    startDate: tab.startDate || now.slice(0, 10),
    createdAt: tab.createdAt || now,
    updatedAt: tab.updatedAt || now,
  };
}

function normalizePost(post, now = currentIso()) {
  return {
    id: post.id,
    firmId: post.firmId || '',
    tabId: post.tabId || '',
    status: post.status === 'published' ? 'published' : 'scheduled',
    isCreated: post.status === 'published' ? false : Boolean(post.isCreated),
    publishDate: post.publishDate || post.date || now.slice(0, 10),
    slotDate: typeof post.slotDate === 'string' ? post.slotDate : '',
    title: post.title || '',
    link: post.link || post.url || '',
    content: post.content || '',
    keywords: Array.isArray(post.keywords)
      ? post.keywords.map((item) => String(item || '').trim()).filter(Boolean)
      : String(post.keywords || '').split(',').map((item) => item.trim()).filter(Boolean),
    dismissedSimilarSignatures: Array.isArray(post.dismissedSimilarSignatures)
      ? post.dismissedSimilarSignatures.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    createdAt: post.createdAt || now,
    updatedAt: post.updatedAt || now,
  };
}

async function ensureFirmPostDoc(firm) {
  await ensureFirmyAdminSession();
  const now = currentIso();
  await setDoc(doc(db, 'firmy_clients', firm.id), {
    id: firm.id,
    name: firm.name || '',
    displayName: firm.displayName || '',
    nip: firm.nip || '',
    updatedAt: now,
  }, { merge: true });
}

function fallbackPostCollections(firm) {
  const { postTabs: tabs, posts, deletedPostTabs } = filterDeletedPostCollections({
    ...firm,
    postTabs: Array.isArray(firm.postTabs) ? firm.postTabs : defaultPostTabs(),
  });
  return {
    deletedPostTabs,
    tabs: tabs.map((tab) => normalizeTab({ ...tab, firmId: firm.id })),
    posts: posts.map((post) => normalizePost({ ...post, firmId: firm.id })),
    fallback: true,
  };
}

async function loadCollection(pathSegments) {
  const snap = await getDocs(collection(db, ...pathSegments));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function loadFirmPostCollections(firm) {
  await ensureFirmyAdminSession();

  let tabs;
  let posts;
  let deletedPostTabs = mergeDeletedPostTabs(firm);
  try {
    const firmDoc = await getDoc(doc(db, 'firmy_clients', firm.id));
    deletedPostTabs = mergeDeletedPostTabs(firm, firmDoc.data());
    tabs = (await loadCollection(['firmy_clients', firm.id, 'post_tabs']))
      .map((tab) => normalizeTab({ ...tab, firmId: firm.id }));
    posts = (await loadCollection(['firmy_clients', firm.id, 'posts']))
      .map((post) => normalizePost({ ...post, firmId: firm.id }));
  } catch (error) {
    if (isPermissionError(error)) {
      console.info('Brak uprawnień do subkolekcji postów. Używam danych lokalnych.', error);
      return fallbackPostCollections({ ...firm, deletedPostTabs });
    }
    throw error;
  }

  const filtered = filterDeletedPostCollections({ deletedPostTabs, postTabs: tabs, posts });
  tabs = filtered.postTabs;
  posts = filtered.posts;
  firm = { ...firm, deletedPostTabs };
  const legacy = filterDeletedPostCollections(firm);
  const legacyTabs = legacy.postTabs;
  const legacyPosts = legacy.posts;
  const normalizedLegacyTabs = legacyTabs.map((tab) => normalizeTab({ ...tab, firmId: firm.id }));
  const normalizedLegacyPosts = legacyPosts.map((post) => normalizePost({ ...post, firmId: firm.id }));

  const tabIds = new Set(tabs.map(({ id }) => id));
  const postIds = new Set(posts.map(({ id }) => id));
  const addedTabs = normalizedLegacyTabs.filter(({ id }) => id && !tabIds.has(id));
  const addedPosts = normalizedLegacyPosts.filter(({ id }) => id && !postIds.has(id));
  tabs = mergePostRecords(tabs, addedTabs);
  posts = mergePostRecords(posts, addedPosts);
  if (addedTabs.length || addedPosts.length) {
    try {
      await savePostCollections(firm, addedTabs, addedPosts);
    } catch (error) {
      if (!isPermissionError(error)) throw error;
      console.info('Brak uprawnień do synchronizacji lokalnych postów z Firestore. Zachowuję je lokalnie.', error);
      return { tabs, posts, deletedPostTabs, fallback: true };
    }
  }

  if (!tabs.length && !Array.isArray(firm.postTabs)) {
    tabs = filterDeletedPostCollections({ deletedPostTabs, postTabs: defaultPostTabs() })
      .postTabs.map((tab) => normalizeTab({ ...tab, firmId: firm.id }));
    try {
      await savePostTabs(firm, tabs);
    } catch (error) {
      if (!isPermissionError(error)) throw error;
      console.info('Brak uprawnień do zapisania domyślnych zakładek postów. Używam ich lokalnie.', error);
    }
  }

  return { tabs, posts, deletedPostTabs };
}

export async function savePostCollections(firm, tabs, posts) {
  await ensureFirmPostDoc(firm);
  const batch = writeBatch(db);
  for (const tab of tabs) {
    const normalized = normalizeTab({ ...tab, firmId: firm.id });
    batch.set(doc(db, 'firmy_clients', firm.id, 'post_tabs', normalized.id), normalized, { merge: true });
  }
  for (const post of posts) {
    const normalized = normalizePost({ ...post, firmId: firm.id });
    batch.set(doc(db, 'firmy_clients', firm.id, 'posts', normalized.id), normalized, { merge: true });
  }
  await batch.commit();
}

export function savePostTabs(firm, tabs) {
  return savePostCollections(firm, tabs, []);
}

export async function savePostTab(firm, tab) {
  await ensureFirmPostDoc(firm);
  const normalized = normalizeTab({ ...tab, firmId: firm.id });
  await setDoc(doc(db, 'firmy_clients', firm.id, 'post_tabs', normalized.id), normalized, { merge: true });
}

export async function deletePostTab(firm, tabId) {
  await ensureFirmPostDoc(firm);
  const batch = writeBatch(db);
  batch.set(doc(db, 'firmy_clients', firm.id), {
    deletedPostTabs: { [tabId]: true },
  }, { merge: true });
  batch.delete(doc(db, 'firmy_clients', firm.id, 'post_tabs', tabId));
  const posts = await loadCollection(['firmy_clients', firm.id, 'posts']);
  for (const post of posts) {
    if (post.tabId === tabId) {
      batch.delete(doc(db, 'firmy_clients', firm.id, 'posts', post.id));
    }
  }
  await batch.commit();
}

export async function savePost(firm, post) {
  await ensureFirmPostDoc(firm);
  const normalized = normalizePost({ ...post, firmId: firm.id });
  await setDoc(doc(db, 'firmy_clients', firm.id, 'posts', normalized.id), normalized, { merge: true });
}

export function savePosts(firm, posts) {
  return savePostCollections(firm, [], posts);
}

export async function deletePost(firm, postId) {
  await ensureFirmyAdminSession();
  await deleteDoc(doc(db, 'firmy_clients', firm.id, 'posts', postId));
}
