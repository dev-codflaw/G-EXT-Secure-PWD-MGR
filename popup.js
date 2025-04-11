// --- popup.js ---

let sessionMasterKey = null;
const passwordState = {};

document.addEventListener('DOMContentLoaded', () => {
  const addBtn = document.getElementById('addBtn');
  const formContainer = document.getElementById('form-container');
  const saveBtn = document.getElementById('saveBtn');
  const closeBtn = document.getElementById('closeBtn');
  const siteInput = document.getElementById('site');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const rememberCheck = document.getElementById('rememberMaster');
  const searchInput = document.getElementById('search');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');

  addBtn.addEventListener('click', () => {
    formContainer.style.display = 'block';
  });

  closeBtn.addEventListener('click', () => {
    formContainer.style.display = 'none';
    siteInput.value = '';
    usernameInput.value = '';
    passwordInput.value = '';
    rememberCheck.checked = false;
    sessionMasterKey = null;
  });

  saveBtn.addEventListener('click', async () => {
    const site = siteInput.value.trim();
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!site || !username || !password) {
      showToast('Please fill in all fields.');
      return;
    }

    if (!sessionMasterKey) {
      const masterPassword = prompt("Enter your master password:");
      sessionMasterKey = await window.cryptoHelper.deriveKey(masterPassword);
      if (!rememberCheck.checked) sessionMasterKey = null;
    }

    const key = sessionMasterKey || await window.cryptoHelper.deriveKey(prompt("Enter your master password:"));
    const encrypted = await window.cryptoHelper.encryptData(password, key);

    const entry = {
      id: Date.now(),
      site,
      username,
      encryptedPassword: encrypted.data,
      iv: encrypted.iv,
      pinned: false
    };

    await window.vaultDB.addEntry(entry);

    siteInput.value = '';
    usernameInput.value = '';
    passwordInput.value = '';
    formContainer.style.display = 'none';

    showToast('Entry saved successfully.');
    await renderEntries();
  });

  exportBtn.addEventListener('click', async () => {
    const entries = await window.vaultDB.getAllEntries();
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'password_vault_backup.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  importBtn.addEventListener('click', () => importFile.click());

  importFile.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data)) throw new Error('Invalid JSON structure');

        for (const entry of data) {
          if (entry.id && entry.site && entry.username && entry.encryptedPassword && entry.iv) {
            await window.vaultDB.addEntry(entry);
          }
        }
        await renderEntries();
        showToast('Data imported successfully.');
      } catch (err) {
        showToast('Failed to import data: ' + err.message);
      }
    };
    reader.readAsText(file);
  });

  searchInput.addEventListener('input', renderEntries);

  renderEntries();
});

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

async function renderEntries() {
  const vaultList = document.getElementById('vaultList');
  vaultList.innerHTML = '';
  const searchValue = document.getElementById('search').value.toLowerCase();

  const entries = await window.vaultDB.getAllEntries();
  const filtered = entries.filter(entry => entry.site.toLowerCase().includes(searchValue));

  const pinnedSection = document.createElement('div');
  const unpinnedSection = document.createElement('div');

  const pinnedCount = filtered.filter(e => e.pinned).length;
  const unpinnedCount = filtered.length - pinnedCount;

  for (const entry of filtered.sort((a, b) => b.pinned - a.pinned)) {
    const li = document.createElement('li');
    const pinIcon = entry.pinned ? 'push_pin' : 'push_pin';
    const pinStyle = entry.pinned ? 'color:#007bff;' : 'color:#aaa;';

    li.innerHTML = `
      <div class="entry-header">
        <div class="entry"><strong>Sitename:</strong> ${entry.site}</div>
        <span class="entry-actions">
          <button class="pin" title="Pin/Unpin" style="${pinStyle}; background:none; border:none;"><span class="material-icons" style="font-size:20px;">${pinIcon}</span></button>
          <button class="delete" title="Delete" style="background:none; border:none;"><span class="material-icons" style="font-size:20px;">delete</span></button>
        </span>
      </div>
      <div class="entry-email"><strong>Email:</strong> ${entry.username}</div>
      <div class="entry-password-row" style="display:flex; align-items:center; justify-content:space-between;">
        <div class="entry-password-label"><strong>Password:</strong></div>
        <div style="flex:1; margin: 0 6px;" class="entry-password" id="pwd-${entry.id}">********</div>
        <button class="toggle" data-id="${entry.id}" title="Show/Hide" style="background:none; border:none;"><span class="material-icons" style="font-size:20px;">visibility</span></button>
      </div>
    `;

    li.querySelector('.toggle').addEventListener('click', async () => {
      const pwdElem = li.querySelector(`#pwd-${entry.id}`);
      const isHidden = pwdElem.textContent === '********';

      if (isHidden) {
        const mp = sessionMasterKey || prompt("Enter master password:");
        const key = sessionMasterKey || await window.cryptoHelper.deriveKey(mp);
        const decrypted = await window.cryptoHelper.decryptData({
          data: entry.encryptedPassword,
          iv: entry.iv
        }, key);
        pwdElem.textContent = decrypted;
        passwordState[entry.id] = decrypted;
      } else {
        pwdElem.textContent = '********';
        delete passwordState[entry.id];
      }
    });

    li.querySelector('.pin').addEventListener('click', async () => {
      entry.pinned = !entry.pinned;
      await window.vaultDB.updateEntry(entry);
      await renderEntries();
    });

    li.querySelector('.delete').addEventListener('click', async () => {
      await window.vaultDB.deleteEntry(entry.id);
      await renderEntries();
    });

    if (entry.pinned) {
      pinnedSection.appendChild(li);
    } else {
      unpinnedSection.appendChild(li);
    }
  }

  if (pinnedSection.children.length > 0) {
    const pinnedHeader = document.createElement('h4');
    pinnedHeader.textContent = `Pinned (${pinnedCount})`;
    vaultList.appendChild(pinnedHeader);
    vaultList.appendChild(pinnedSection);
  }

  if (unpinnedSection.children.length > 0) {
    const unpinnedHeader = document.createElement('h4');
    unpinnedHeader.textContent = `All Items (${unpinnedCount})`;
    vaultList.appendChild(unpinnedHeader);
    vaultList.appendChild(unpinnedSection);
  }
}
