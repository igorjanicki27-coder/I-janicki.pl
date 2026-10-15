// Keep deletion records when merging older local or cloud backups.
export function mergeDeletedPostTabs(...firms) {
  return Object.fromEntries(firms.flatMap((firm) =>
    Object.entries(firm?.deletedPostTabs || {}).filter(([, deleted]) => deleted === true)));
}

export function filterDeletedPostCollections(firm) {
  const deletedPostTabs = mergeDeletedPostTabs(firm);
  return {
    deletedPostTabs,
    postTabs: (Array.isArray(firm.postTabs) ? firm.postTabs : []).filter((tab) => deletedPostTabs[tab.id] !== true),
    posts: (Array.isArray(firm.posts) ? firm.posts : []).filter((post) => deletedPostTabs[post.tabId] !== true),
  };
}

export function markPostTabDeleted(firm, tabId) {
  firm.deletedPostTabs = { ...mergeDeletedPostTabs(firm), [tabId]: true };
  Object.assign(firm, filterDeletedPostCollections(firm));
}
