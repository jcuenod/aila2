import { html, mount, createReactive } from 'https://cdn.jsdelivr.net/gh/jcuenod/murjs@42097f2/src/index.js';

// Patch storage
const PATCHES_KEY = 'aila2-patches';

const loadPatches = () => {
  try {
    return JSON.parse(localStorage.getItem(PATCHES_KEY)) || {};
  } catch { return {}; }
};

const savePatches = (patches) => {
  localStorage.setItem(PATCHES_KEY, JSON.stringify(patches));
};

const getPatchKey = (type, idOrForm) => `${type}:${idOrForm}`;

const getEntryWithPatch = (type, entry) => {
  // Unknown entries use 'form' as identifier, others use 'id'
  const identifier = type === 'unknown' ? entry.form : entry.id;
  const key = getPatchKey(type, identifier);
  const patch = state.patches[key];
  return patch ? { ...entry, ...patch } : entry;
};

const hasPatched = (type, idOrForm) => {
  return !!state.patches[getPatchKey(type, idOrForm)];
};

// State
const state = createReactive({
  alignments: null,
  glossary: null,
  rules: null,
  searchQuery: '',
  sidebarSearch: '',
  selectedWord: null,
  editingEntry: null,
  patches: loadPatches(),
});

// File upload handlers
const handleFileUpload = (type) => (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      state[type] = data;
    } catch (err) {
      console.error(`Error parsing ${type}:`, err);
    }
  };
  reader.readAsText(file);
};

// Helpers
const isDataLoaded = () => state.alignments && state.glossary && state.rules;

const getWordStatus = (word) => {
  const unknownMorphemes = word.morphemes.filter(m => m.type === 'unknown');
  const knownMorphemes = word.morphemes.filter(m => m.type !== 'unknown');

  // Check if all unknown morphemes have been patched with a gloss
  const unpatchedUnknowns = unknownMorphemes.filter(m => {
    const patch = getEntryWithPatch('unknown', m);
    return !patch.gloss || patch.gloss === m.gloss;
  });

  const hasUnpatched = unpatchedUnknowns.length > 0;
  const hasPatched = unknownMorphemes.length > unpatchedUnknowns.length;
  const hasKnown = knownMorphemes.length > 0;

  if (hasUnpatched && (hasKnown || hasPatched)) return 'mixed';
  if (hasUnpatched) return 'unknown';
  if (hasPatched) return 'patched';
  return 'known';
};

const filterAlignments = () => {
  if (!state.alignments) return [];
  const query = state.searchQuery.toLowerCase();

  // Return alignments with their original indices
  return state.alignments.alignments
    .map((line, originalIndex) => ({ line, originalIndex }))
    .filter(({ line }) =>
      !query ||
      line.source_line.toLowerCase().includes(query) ||
      line.target_line.toLowerCase().includes(query)
    );
};

const getFilteredGlossary = () => {
  if (!state.glossary) return [];
  const search = state.sidebarSearch.toLowerCase();
  const selected = state.selectedWord;

  let entries = state.glossary.entries;

  // If word selected, filter to relevant morphemes
  if (selected) {
    const sourceIds = selected.morphemes
      .filter(m => m.source_type === 'glossary')
      .map(m => m.source_id);

    if (sourceIds.length > 0) {
      entries = entries.filter(e => sourceIds.includes(e.id));
    }
  }

  // Apply search filter (including patched values)
  if (search) {
    entries = entries.filter(e => {
      const patched = getEntryWithPatch('glossary', e);
      return patched.form.toLowerCase().includes(search) ||
        patched.gloss.toLowerCase().includes(search);
    });
  }

  // Sort alphabetically by form
  entries = [...entries].sort((a, b) => a.form.localeCompare(b.form));

  return entries.slice(0, 50); // Limit for performance
};

const getFilteredRules = () => {
  if (!state.rules) return [];
  const search = state.sidebarSearch.toLowerCase();
  const selected = state.selectedWord;

  let rules = state.rules.rules;

  // If word selected, filter to relevant morphemes
  if (selected) {
    const sourceIds = selected.morphemes
      .filter(m => m.source_type === 'rule')
      .map(m => m.source_id);

    if (sourceIds.length > 0) {
      rules = rules.filter(r => sourceIds.includes(r.id));
    }
  }

  // Apply search filter (including patched values)
  if (search) {
    rules = rules.filter(r => {
      const patched = getEntryWithPatch('rule', r);
      return patched.form.toLowerCase().includes(search) ||
        patched.gloss.toLowerCase().includes(search) ||
        patched.description.toLowerCase().includes(search);
    });
  }

  // Sort alphabetically by form
  return [...rules].sort((a, b) => a.form.localeCompare(b.form));
};

const selectWord = (word) => {
  if (state.selectedWord === word) {
    state.selectedWord = null;
  } else {
    state.selectedWord = word;
  }
};

const deselectWord = () => {
  state.selectedWord = null;
};

// Get entries for a selected word's morphemes in order
const getMorphemeEntries = (word) => {
  if (!word) return [];

  return word.morphemes.map(m => {
    if (m.source_type === 'glossary') {
      const entry = state.glossary.entries.find(e => e.id === m.source_id);
      if (entry) {
        const patched = getEntryWithPatch('glossary', entry);
        return { type: 'glossary', entry: patched, originalEntry: entry, morpheme: m };
      }
      return { type: 'unknown', morpheme: m };
    } else if (m.source_type === 'rule') {
      const rule = state.rules.rules.find(r => r.id === m.source_id);
      if (rule) {
        const patched = getEntryWithPatch('rule', rule);
        return { type: 'rule', entry: patched, originalEntry: rule, morpheme: m };
      }
      return { type: 'unknown', morpheme: m };
    }
    return { type: 'unknown', morpheme: m };
  });
};

// Combine gloss from all morphemes for display (with patches applied)
const getWordGloss = (word) => {
  return word.morphemes.map(m => {
    // Check for patches based on source type
    if (m.source_type === 'glossary') {
      const entry = state.glossary?.entries.find(e => e.id === m.source_id);
      if (entry) {
        const patched = getEntryWithPatch('glossary', entry);
        return patched.gloss;
      }
    } else if (m.source_type === 'rule') {
      const rule = state.rules?.rules.find(r => r.id === m.source_id);
      if (rule) {
        const patched = getEntryWithPatch('rule', rule);
        return patched.gloss;
      }
    }
    // Check for unknown morpheme patches
    const unknownPatch = getEntryWithPatch('unknown', m);
    if (unknownPatch.gloss && unknownPatch.gloss !== m.gloss) {
      return unknownPatch.gloss;
    }
    return m.gloss;
  }).join(' + ');
};

const reset = () => {
  state.alignments = null;
  state.glossary = null;
  state.rules = null;
  state.searchQuery = '';
  state.sidebarSearch = '';
  state.selectedWord = null;
};

// Modal functions
const openEditModal = (type, entry) => {
  state.editingEntry = { type, entry };
};

const closeModal = () => {
  state.editingEntry = null;
};

const savePatch = (modalEl) => {
  const { type, entry } = state.editingEntry;
  // Unknown entries use 'form' as identifier, others use 'id'
  const identifier = type === 'unknown' ? entry.form : entry.id;
  const key = getPatchKey(type, identifier);

  const patch = {};
  modalEl.querySelectorAll('[data-field]').forEach(input => {
    const field = input.dataset.field;
    const value = input.value;
    if (value !== (entry[field] || '')) {
      patch[field] = value;
    }
  });

  if (Object.keys(patch).length > 0) {
    state.patches = { ...state.patches, [key]: { ...state.patches[key], ...patch } };
    savePatches(state.patches);
  }
  closeModal();
};

// Components
const UploadZone = ({ type, label, data }) => {
  const loaded = data !== null;
  const status = loaded
    ? `${type === 'alignments' ? data.alignments?.length || 0 : (data.entries?.length || data.rules?.length || 0)} items`
    : 'Click to upload';

  return html`
    <label class="upload-zone ${loaded ? 'loaded' : ''}">
      <input type="file" accept=".json" onChange=${handleFileUpload(type)} />
      <div class="upload-zone-label">${label}</div>
      <div class="upload-zone-status">${status}</div>
    </label>
  `;
};

const UploadScreen = () => html`
  <div class="upload-screen">
    <h1>Alignment Viewer</h1>
    <p>Upload your JSON files to get started</p>
    <div class="upload-zones">
      ${UploadZone({ type: 'alignments', label: 'Alignments', data: state.alignments })}
      ${UploadZone({ type: 'glossary', label: 'Glossary', data: state.glossary })}
      ${UploadZone({ type: 'rules', label: 'Rules', data: state.rules })}
    </div>
  </div>
`;

const TargetWord = ({ word }) => {
  const status = getWordStatus(word);
  const isSelected = state.selectedWord === word;
  const gloss = getWordGloss(word);
  const shortGloss = gloss.length > 13 ? gloss.slice(0, 10) + '...' : gloss;

  return html`
    <span
      class="target-word ${status} ${isSelected ? 'selected' : ''}"
      onClick=${() => selectWord(word)}
    >
      <span class="target-word-form">${word.word}</span>
      <span class="target-word-gloss" title="${gloss}">${shortGloss}</span>
    </span>
  `;
};

const AlignmentLine = ({ line, index }) => html`
  <div class="alignment-line">
    <div class="line-number">Line ${index + 1}</div>
    <div class="source-line">${line.source_line}</div>
    <div class="target-line">${line.target_line}</div>
    <div class="target-words">
      ${line.words.map((word, i) => TargetWord({ key: i, word }))}
    </div>
  </div>
`;

const MorphemeTag = ({ morpheme }) => html`
  <span class="morpheme-tag ${morpheme.type}">
    ${morpheme.form} (${morpheme.gloss})
  </span>
`;

const SelectedWordDisplay = ({ word }) => html`
  <div class="selected-word-display">
    <div class="selected-word-form">${word.word}</div>
    <div class="morpheme-breakdown">
      ${word.morphemes.map((m, i) => MorphemeTag({ key: i, morpheme: m }))}
    </div>
  </div>
`;

const GlossaryEntry = ({ entry }) => {
  const patched = getEntryWithPatch('glossary', entry);
  const isPatched = hasPatched('glossary', entry.id);

  return html`
    <div class="entry-card ${isPatched ? 'patched' : ''}"
         onClick=${() => openEditModal('glossary', entry)}>
      <div class="entry-form">${patched.form}</div>
      <div class="entry-gloss">${patched.gloss}</div>
      <div class="entry-meta">
        <span class="entry-type">${patched.pos}</span>
        ${patched.notes ? patched.notes : ''}
      </div>
    </div>
  `;
};

const RuleEntry = ({ rule }) => {
  const patched = getEntryWithPatch('rule', rule);
  const isPatched = hasPatched('rule', rule.id);

  return html`
    <div class="entry-card ${isPatched ? 'patched' : ''}"
         onClick=${() => openEditModal('rule', rule)}>
      <div class="entry-form">${patched.form}</div>
      <div class="entry-gloss">${patched.gloss}</div>
      <div class="entry-meta">
        <span class="entry-type">${patched.type}</span>
        ${patched.description}
      </div>
    </div>
  `;
};

const UnknownEntry = ({ morpheme }) => {
  const patched = getEntryWithPatch('unknown', morpheme);
  const isPatched = hasPatched('unknown', morpheme.form);

  return html`
    <div class="entry-card ${isPatched ? 'entry-unknown-patched' : 'entry-unknown'}"
         onClick=${() => openEditModal('unknown', morpheme)}>
      <div class="entry-form">${patched.form}</div>
      <div class="entry-gloss">${isPatched ? patched.gloss : 'Unknown morpheme'}</div>
      <div class="entry-meta">
        <span class="entry-type">${patched.pos || 'unknown'}</span>
        ${isPatched ? (patched.notes || '') : 'No entry found in glossary or rules'}
      </div>
    </div>
  `;
};

const MorphemeEntry = ({ item, index }) => {
  if (item.type === 'glossary') {
    return GlossaryEntry({ entry: item.originalEntry });
  } else if (item.type === 'rule') {
    return RuleEntry({ rule: item.originalEntry });
  }
  return UnknownEntry({ morpheme: item.morpheme });
};

const SelectedWordSidebar = ({ word }) => {
  const entries = getMorphemeEntries(word);

  return html`
    <div class="sidebar">
      <div class="sidebar-header">
        <button class="back-btn" onClick=${deselectWord}>Back</button>
      </div>
      <div class="sidebar-content">
        ${SelectedWordDisplay({ word })}

        <div class="sidebar-section">
          <div class="sidebar-section-title">Morpheme Entries (${entries.length})</div>
          ${entries.map((item, i) => MorphemeEntry({ key: i, item, index: i }))}
        </div>
      </div>
    </div>
  `;
};

const BrowseSidebar = () => {
  const glossaryEntries = getFilteredGlossary();
  const ruleEntries = getFilteredRules();

  return html`
    <div class="sidebar">
      <div class="sidebar-header">
        <h2>Dictionary</h2>
        <input
          type="text"
          class="sidebar-search"
          placeholder="Search glossary & rules..."
          value="${state.sidebarSearch}"
          onInput=${(e) => { state.sidebarSearch = e.target.value; }}
        />
      </div>
      <div class="sidebar-content">
        <div class="sidebar-section">
          <div class="sidebar-section-title">Rules (${ruleEntries.length})</div>
          ${ruleEntries.length > 0
            ? ruleEntries.map(rule => RuleEntry({ key: rule.id, rule }))
            : html`<div class="empty-state">No matching rules</div>`
          }
        </div>

        <div class="sidebar-section">
          <div class="sidebar-section-title">Glossary (${glossaryEntries.length}${glossaryEntries.length >= 50 ? '+' : ''})</div>
          ${glossaryEntries.length > 0
            ? glossaryEntries.map(entry => GlossaryEntry({ key: entry.id, entry }))
            : html`<div class="empty-state">No matching entries</div>`
          }
        </div>
      </div>
    </div>
  `;
};

const Sidebar = () => {
  if (state.selectedWord) {
    return SelectedWordSidebar({ word: state.selectedWord });
  }
  return BrowseSidebar();
};

const EditModal = () => {
  if (!state.editingEntry) return null;

  const { type, entry } = state.editingEntry;
  const patched = getEntryWithPatch(type, entry);

  const handleSave = (e) => {
    const modal = e.target.closest('.modal');
    savePatch(modal);
  };

  const getTitle = () => {
    if (type === 'glossary') return 'Glossary Entry';
    if (type === 'rule') return 'Rule';
    return 'Unknown Morpheme';
  };

  return html`
    <div class="modal-overlay" onClick=${closeModal}>
      <div class="modal" onClick=${(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h3>Edit ${getTitle()}</h3>
          <button class="modal-close" onClick=${closeModal}>×</button>
        </div>
        <div class="modal-body">
          <label class="modal-field">
            <span>Form</span>
            <input type="text" value="${patched.form}" data-field="form" />
          </label>
          <label class="modal-field">
            <span>Gloss</span>
            <input type="text" value="${patched.gloss || ''}" data-field="gloss" />
          </label>
          ${type === 'glossary' || type === 'unknown' ? html`
            <span>
            <label class="modal-field">
              <span>Part of Speech</span>
              <input type="text" value="${patched.pos || ''}" data-field="pos" />
            </label>
            <label class="modal-field">
              <span>Notes</span>
              <textarea data-field="notes">${patched.notes || ''}</textarea>
            </label>
            </span>
          ` : html`
            <span>
            <label class="modal-field">
              <span>Type</span>
              <input type="text" value="${patched.type || ''}" data-field="type" />
            </label>
            <label class="modal-field">
              <span>Description</span>
              <textarea data-field="description">${patched.description || ''}</textarea>
            </label>
            </span>
          `}
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onClick=${closeModal}>Cancel</button>
          <button class="btn-primary" onClick=${handleSave}>Save</button>
        </div>
      </div>
    </div>
  `;
};

const MainView = () => {
  const alignments = filterAlignments();

  return html`
    <div class="app-container">
      <div class="main-panel">
        <div class="header">
          <div class="header-top">
            <h1>${state.alignments.project || 'Alignments'}</h1>
            <button class="reset-btn" onClick=${reset}>Reset</button>
          </div>
          <div class="header-meta">
            ${state.alignments.source_language} → ${state.alignments.target_language}
            <div class="stats">
              <span class="stat"><span class="stat-value">${state.alignments.alignments.length}</span> lines</span>
              <span class="stat"><span class="stat-value">${state.glossary.entries.length}</span> glossary entries</span>
              <span class="stat"><span class="stat-value">${state.rules.rules.length}</span> rules</span>
            </div>
          </div>
          <input
            type="text"
            class="search-input"
            placeholder="Filter alignments..."
            value="${state.searchQuery}"
            onInput=${(e) => { state.searchQuery = e.target.value; }}
          />
        </div>

        ${alignments.length > 0
          ? alignments.map(({ line, originalIndex }) => AlignmentLine({ key: originalIndex, line, index: originalIndex }))
          : html`<div class="empty-state">No matching alignments</div>`
        }
      </div>
      ${Sidebar()}
    </div>
  `;
};

const App = () => {
  if (!isDataLoaded()) {
    return UploadScreen();
  }
  return html`
  <div>
    ${MainView()}
    ${EditModal()}
  </div>
  `;
};

mount(App, document.getElementById('app'));
