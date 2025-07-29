// Estado global da aplicação
let currentUser = null;
let currentSubject = null;
let searchTimeout = null;

// Ratings para o modal de avaliação
const ratings = {
  dificuldade: 0,
  didatica: 0,
  carga_horaria: 0
};

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
  loadPopularSubjects();
  setupEventListeners();
  checkAuthStatus();
});

function setupEventListeners() {
  // Search input
  document.getElementById('searchInput').addEventListener('input', handleSearch);

  // Click outside to close dropdowns
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.user-menu')) {
      document.getElementById('userDropdown').classList.add('hidden');
    }
    if (!e.target.closest('.search-container')) {
      document.getElementById('searchResults').classList.add('hidden');
    }
  });

  // Rating stars setup
  setupRatingStars();

  // File upload setup
  setupFileUpload();
}

function setupRatingStars() {
  document.querySelectorAll('.rating-stars').forEach(container => {
    const rating = container.dataset.rating;
    const stars = container.querySelectorAll('.star');

    stars.forEach((star, index) => {
      star.addEventListener('click', () => {
        const value = parseInt(star.dataset.value);
        ratings[rating] = value;

        // Update visual state
        stars.forEach((s, i) => {
          s.classList.toggle('active', i < value);
        });
      });

      star.addEventListener('mouseenter', () => {
        const value = parseInt(star.dataset.value);
        stars.forEach((s, i) => {
          s.style.color = i < value ? '#ffc107' : '#e9ecef';
        });
      });
    });

    container.addEventListener('mouseleave', () => {
      const currentRating = ratings[rating];
      stars.forEach((s, i) => {
        s.style.color = i < currentRating ? '#ffc107' : '#e9ecef';
      });
    });
  });
}

function setupFileUpload() {
  const fileUpload = document.querySelector('.file-upload');
  const fileInput = document.getElementById('materialFile');
  const fileUploadText = document.getElementById('fileUploadText');

  if (!fileUpload || !fileInput || !fileUploadText) return;

  fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
      fileUploadText.innerHTML = `
        <p>📄 ${file.name}</p>
        <p style="font-size: 0.9rem; color: #6c757d;">${formatFileSize(file.size)}</p>
      `;
    }
  });

  // Drag and drop
  fileUpload.addEventListener('dragover', function(e) {
    e.preventDefault();
    fileUpload.classList.add('dragover');
  });

  fileUpload.addEventListener('dragleave', function(e) {
    e.preventDefault();
    fileUpload.classList.remove('dragover');
  });

  fileUpload.addEventListener('drop', function(e) {
    e.preventDefault();
    fileUpload.classList.remove('dragover');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      fileInput.files = files;
      const file = files[0];
      fileUploadText.innerHTML = `
        <p>📄 ${file.name}</p>
        <p style="font-size: 0.9rem; color: #6c757d;">${formatFileSize(file.size)}</p>
      `;
    }
  });
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Navegação
function showHome() {
  document.getElementById('homeSection').classList.remove('hidden');
  document.getElementById('subjectDetails').classList.add('hidden');
  document.getElementById('userProfile').classList.add('hidden');
  currentSubject = null;
}

function showSubject(subjectId) {
  currentSubject = subjectId;
  loadSubjectDetails(subjectId);
  document.getElementById('homeSection').classList.add('hidden');
  document.getElementById('subjectDetails').classList.remove('hidden');
  document.getElementById('userProfile').classList.add('hidden');
}

function showProfile() {
  if (!currentUser) {
    openAuthModal('login');
    return;
  }

  loadUserProfile();
  document.getElementById('homeSection').classList.add('hidden');
  document.getElementById('subjectDetails').classList.add('hidden');
  document.getElementById('userProfile').classList.remove('hidden');
  document.getElementById('userDropdown').classList.add('hidden');
}

// Abas
function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('#subjectDetails .tab').forEach(tab => {
    tab.classList.remove('active');
  });
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

  // Update tab content
  document.getElementById('reviewsTab').classList.toggle('hidden', tabName !== 'reviews');
  document.getElementById('materialsTab').classList.toggle('hidden', tabName !== 'materials');

  // Load content if needed
  if (tabName === 'materials' && currentSubject) {
    loadSubjectMaterials(currentSubject);
  }
}

function switchProfileTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('#userProfile .tab').forEach(tab => {
    tab.classList.remove('active');
  });
  document.querySelector(`#userProfile [data-tab="${tabName}"]`).classList.add('active');

  // Update tab content
  document.getElementById('myReviewsTab').classList.toggle('hidden', tabName !== 'myReviews');
  document.getElementById('myUploadsTab').classList.toggle('hidden', tabName !== 'myUploads');

  // Load content if needed
  if (tabName === 'myUploads') {
    loadUserMaterials();
  }
}

// Busca
function handleSearch(e) {
  const query = e.target.value.trim();

  clearTimeout(searchTimeout);

  if (query.length < 2) {
    document.getElementById('searchResults').classList.add('hidden');
    return;
  }

  searchTimeout = setTimeout(() => {
    searchSubjects(query);
  }, 300);
}

async function searchSubjects(query) {
  try {
    const response = await fetch(`/api/subjects/search?q=${encodeURIComponent(query)}`);
    const subjects = await response.json();

    const resultsContainer = document.getElementById('searchResults');

    if (subjects.length === 0) {
      resultsContainer.innerHTML = '<div class="search-result-item">Nenhuma disciplina encontrada</div>';
    } else {
      resultsContainer.innerHTML = subjects.map(subject => `
        <div class="search-result-item" onclick="showSubject(${subject.id})">
          <strong>${subject.name}</strong> - ${subject.code}<br>
          <small>Prof. ${subject.professor}</small>
        </div>
      `).join('');
    }

    resultsContainer.classList.remove('hidden');
  } catch (error) {
    console.error('Erro na busca:', error);
  }
}

// Carregar disciplinas populares
async function loadPopularSubjects() {
  try {
    const response = await fetch('/api/subjects/popular');
    const subjects = await response.json();

    const container = document.getElementById('popularSubjects');

    if (subjects.length === 0) {
      container.innerHTML = '<div class="empty-state"><h3>Nenhuma disciplina encontrada</h3></div>';
    } else {
      container.innerHTML = subjects.map(subject => `
        <div class="card" onclick="showSubject(${subject.id})">
          <h3>${subject.name}</h3>
          <div class="code">${subject.code}</div>
          <div class="professor">Prof. ${subject.professor}</div>
          <div class="stats">
            <span>${subject.review_count || 0} avaliações</span>
          </div>
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Erro ao carregar disciplinas populares:', error);
    document.getElementById('popularSubjects').innerHTML = '<div class="empty-state"><h3>Erro ao carregar disciplinas</h3></div>';
  }
}

// Carregar detalhes da disciplina
async function loadSubjectDetails(subjectId) {
  try {
    const [subjectResponse, reviewsResponse] = await Promise.all([
      fetch(`/api/subjects/${subjectId}`),
      fetch(`/api/subjects/${subjectId}/reviews`)
    ]);

    const subject = await subjectResponse.json();
    const reviewsData = await reviewsResponse.json();

    // Update subject header
    document.getElementById('subjectTitle').textContent = subject.name;
    document.getElementById('subjectCode').textContent = subject.code;
    document.getElementById('subjectProfessor').textContent = `Prof. ${subject.professor}`;

    // Update ratings summary
    loadRatingSummary(reviewsData.averages);

    // Load reviews
    loadReviews(reviewsData.reviews);

    // Reset to reviews tab
    switchTab('reviews');

  } catch (error) {
    console.error('Erro ao carregar detalhes da disciplina:', error);
  }
}

function loadRatingSummary(averages) {
  const container = document.getElementById('ratingSummary');

  if (!averages || averages.total_reviews === 0) {
    container.innerHTML = '<div class="empty-state"><p>Ainda não há avaliações para esta disciplina</p></div>';
    return;
  }

  container.innerHTML = `
    <div class="rating-item">
      <h4>Dificuldade</h4>
      <div class="stars">${renderStars(averages.avg_dificuldade)}</div>
      <div class="rating-value">${averages.avg_dificuldade.toFixed(1)}</div>
    </div>
    <div class="rating-item">
      <h4>Didática</h4>
      <div class="stars">${renderStars(averages.avg_didatica)}</div>
      <div class="rating-value">${averages.avg_didatica.toFixed(1)}</div>
    </div>
    <div class="rating-item">
      <h4>Carga Horária</h4>
      <div class="stars">${renderStars(averages.avg_carga_horaria)}</div>
      <div class="rating-value">${averages.avg_carga_horaria.toFixed(1)}</div>
    </div>
    <div class="rating-item">
      <h4>Total</h4>
      <div class="rating-value">${averages.total_reviews}</div>
      <small>avaliações</small>
    </div>
  `;
}

function loadReviews(reviews) {
  const container = document.getElementById('reviewList');

  if (reviews.length === 0) {
    container.innerHTML = '<div class="empty-state"><h3>Nenhuma avaliação ainda</h3><p>Seja o primeiro a avaliar esta disciplina!</p></div>';
    return;
  }

  container.innerHTML = reviews.map(review => `
    <div class="review-item">
      <div class="review-header">
        <div class="review-author">${review.author_name}</div>
        <div class="review-date">${formatDate(review.created_at)}</div>
      </div>
      <div class="review-ratings">
        <div class="review-rating">
          <strong>Dificuldade:</strong> ${renderStars(review.dificuldade)}
        </div>
        <div class="review-rating">
          <strong>Didática:</strong> ${renderStars(review.didatica)}
        </div>
        <div class="review-rating">
          <strong>Carga Horária:</strong> ${renderStars(review.carga_horaria)}
        </div>
      </div>
      <div class="review-comment">${review.comentario}</div>
    </div>
  `).join('');
}

async function loadSubjectMaterials(subjectId) {
  try {
    const response = await fetch(`/api/subjects/${subjectId}/materials`);
    const materials = await response.json();

    const container = document.getElementById('materialList');

    if (materials.length === 0) {
      container.innerHTML = '<div class="empty-state"><h3>Nenhum material disponível</h3><p>Seja o primeiro a compartilhar um material!</p></div>';
      return;
    }

    container.innerHTML = materials.map(material => `
      <li class="material-item">
        <div class="material-info">
          <div class="material-name">${material.originalname}</div>
          <div class="material-meta">
            Enviado por ${material.uploader_name} • ${formatDate(material.created_at)}
          </div>
        </div>
        <div class="material-type">${material.tipo}</div>
        <a href="/api/materials/${material.filename}/download" class="btn-download" target="_blank">
          Baixar
        </a>
      </li>
    `).join('');

  } catch (error) {
    console.error('Erro ao carregar materiais:', error);
    document.getElementById('materialList').innerHTML = '<div class="empty-state"><h3>Erro ao carregar materiais</h3></div>';
  }
}

function renderStars(rating) {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  return '★'.repeat(fullStars) +
         (hasHalfStar ? '⭐' : '') +
         '☆'.repeat(emptyStars);
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

// Modais
function openModal(type) {
  if (!currentUser && (type === 'review' || type === 'material')) {
    openAuthModal('login');
    return;
  }

  switch(type) {
    case 'review':
      document.getElementById('reviewModal').classList.remove('hidden');
      resetReviewForm();
      break;
    case 'material':
      document.getElementById('materialModal').classList.remove('hidden');
      resetMaterialForm();
      break;
  }
}

function openAuthModal(mode) {
  document.getElementById('authModal').classList.remove('hidden');
  switchAuthMode(mode);
}

function closeModal() {
  document.querySelectorAll('.modal').forEach(modal => {
    modal.classList.add('hidden');
  });
}

function switchAuthMode(mode) {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  if (mode === 'login') {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
  } else {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
  }
}

function resetReviewForm() {
  // Reset ratings
  Object.keys(ratings).forEach(key => {
    ratings[key] = 0;
  });

  // Reset visual stars
  document.querySelectorAll('.rating-stars .star').forEach(star => {
    star.classList.remove('active');
    star.style.color = '#e9ecef';
  });

  // Reset comment
  document.getElementById('reviewComment').value = '';
}

function resetMaterialForm() {
  const materialType = document.getElementById('materialType');
  const materialFile = document.getElementById('materialFile');
  const fileUploadText = document.getElementById('fileUploadText');

  if (materialType) materialType.value = '';
  if (materialFile) materialFile.value = '';
  if (fileUploadText) {
    fileUploadText.innerHTML = `
      <p>📁 Clique para selecionar um arquivo</p>
      <p style="font-size: 0.9rem; color: #6c757d;">ou arraste e solte aqui</p>
    `;
  }
}

// Autenticação
function checkAuthStatus() {
  const user = localStorage.getItem('currentUser');
  if (user) {
    currentUser = JSON.parse(user);
    updateAuthUI();
  }
}

function updateAuthUI() {
  const authButtons = document.getElementById('authButtons');
  const userInfo = document.getElementById('userInfo');
  const userName = document.getElementById('userName');

  if (currentUser) {
    authButtons.classList.add('hidden');
    userInfo.classList.remove('hidden');
    userName.textContent = currentUser.name;
  } else {
    authButtons.classList.remove('hidden');
    userInfo.classList.add('hidden');
  }
}

function toggleUserMenu() {
  const dropdown = document.getElementById('userDropdown');
  dropdown.classList.toggle('hidden');
}

async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (response.ok) {
      currentUser = data.user;
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      updateAuthUI();
      closeModal();
      alert('Login realizado com sucesso!');
    } else {
      alert(data.error || 'Erro no login');
    }
  } catch (error) {
    console.error('Erro no login:', error);
    alert('Erro de conexão');
  }
}

async function handleRegister(event) {
  event.preventDefault();

  const name = document.getElementById('registerName').value;
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;

  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, email, password })
    });

    const data = await response.json();

    if (response.ok) {
      alert('Cadastro realizado com sucesso! Faça login para continuar.');
      switchAuthMode('login');
    } else {
      alert(data.error || 'Erro no cadastro');
    }
  } catch (error) {
    console.error('Erro no cadastro:', error);
    alert('Erro de conexão');
  }
}

function logout() {
  currentUser = null;
  localStorage.removeItem('currentUser');
  updateAuthUI();
  showHome();
  document.getElementById('userDropdown').classList.add('hidden');
}

// Submissão de avaliação
async function handleReviewSubmit(event) {
  event.preventDefault();

  if (!currentUser) {
    alert('Você precisa estar logado para avaliar');
    return;
  }

  if (!currentSubject) {
    alert('Erro: disciplina não selecionada');
    return;
  }

  // Validar ratings
  if (ratings.dificuldade === 0 || ratings.didatica === 0 || ratings.carga_horaria === 0) {
    alert('Por favor, avalie todos os critérios');
    return;
  }

  const comentario = document.getElementById('reviewComment').value.trim();
  if (!comentario) {
    alert('Por favor, escreva um comentário');
    return;
  }

  try {
    const response = await fetch(`/api/subjects/${currentSubject}/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: currentUser.id,
        dificuldade: ratings.dificuldade,
        didatica: ratings.didatica,
        carga_horaria: ratings.carga_horaria,
        comentario: comentario
      })
    });

    const data = await response.json();

    if (response.ok) {
      closeModal();
      alert('Avaliação publicada com sucesso!');
      // Recarregar avaliações
      loadSubjectDetails(currentSubject);
    } else {
      alert(data.error || 'Erro ao publicar avaliação');
    }
  } catch (error) {
    console.error('Erro ao enviar avaliação:', error);
    alert('Erro de conexão');
  }
}

// Submissão de material
async function handleMaterialSubmit(event) {
  event.preventDefault();

  if (!currentUser) {
    alert('Você precisa estar logado para enviar materiais');
    return;
  }

  if (!currentSubject) {
    alert('Erro: disciplina não selecionada');
    return;
  }

  const tipo = document.getElementById('materialType').value;
  const file = document.getElementById('materialFile').files[0];

  if (!tipo || !file) {
    alert('Por favor, selecione o tipo e o arquivo');
    return;
  }

  const formData = new FormData();
  formData.append('user_id', currentUser.id);
  formData.append('tipo', tipo);
  formData.append('file', file);

  try {
    const response = await fetch(`/api/subjects/${currentSubject}/materials`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (response.ok) {
      closeModal();
      alert('Material enviado com sucesso!');
      // Recarregar materiais se estiver na aba de materiais
      if (!document.getElementById('materialsTab').classList.contains('hidden')) {
        loadSubjectMaterials(currentSubject);
      }
    } else {
      alert(data.error || 'Erro ao enviar material');
    }
  } catch (error) {
    console.error('Erro ao enviar material:', error);
    alert('Erro de conexão');
  }
}

// Perfil do usuário
async function loadUserProfile() {
  if (!currentUser) return;

  try {
    const [reviewsResponse, materialsResponse] = await Promise.all([
      fetch(`/api/users/${currentUser.id}/reviews`),
      fetch(`/api/users/${currentUser.id}/materials`)
    ]);

    const reviews = await reviewsResponse.json();
    const materials = await materialsResponse.json();

    // Update profile info
    document.getElementById('profileUserName').textContent = currentUser.name;
    document.getElementById('profileUserEmail').textContent = currentUser.email;
    document.getElementById('userReviewCount').textContent = reviews.length;
    document.getElementById('userMaterialCount').textContent = materials.length;

    // Load user reviews
    loadUserReviews(reviews);

    // Reset to reviews tab
    switchProfileTab('myReviews');

  } catch (error) {
    console.error('Erro ao carregar perfil:', error);
  }
}

function loadUserReviews(reviews) {
  const container = document.getElementById('userReviewsList');

  if (reviews.length === 0) {
    container.innerHTML = '<div class="empty-state"><h3>Você ainda não fez nenhuma avaliação</h3><p>Explore as disciplinas e compartilhe sua experiência!</p></div>';
    return;
  }

  container.innerHTML = reviews.map(review => `
    <div class="review-item">
      <div class="review-header">
        <div class="review-author">
          <strong>${review.subject_name}</strong> (${review.subject_code})
        </div>
        <div class="review-date">${formatDate(review.created_at)}</div>
      </div>
      <div class="review-ratings">
        <div class="review-rating">
          <strong>Dificuldade:</strong> ${renderStars(review.dificuldade)}
        </div>
        <div class="review-rating">
          <strong>Didática:</strong> ${renderStars(review.didatica)}
        </div>
        <div class="review-rating">
          <strong>Carga Horária:</strong> ${renderStars(review.carga_horaria)}
        </div>
      </div>
      <div class="review-comment">${review.comentario}</div>
    </div>
  `).join('');
}

async function loadUserMaterials() {
  if (!currentUser) return;

  try {
    const response = await fetch(`/api/users/${currentUser.id}/materials`);
    const materials = await response.json();

    const container = document.getElementById('userMaterialsList');

    if (materials.length === 0) {
      container.innerHTML = '<div class="empty-state"><h3>Você ainda não enviou nenhum material</h3><p>Ajude outros alunos compartilhando seus materiais de estudo!</p></div>';
      return;
    }

    container.innerHTML = materials.map(material => `
      <li class="material-item">
        <div class="material-info">
          <div class="material-name">${material.originalname}</div>
          <div class="material-meta">
            <strong>${material.subject_name}</strong> (${material.subject_code}) • ${formatDate(material.created_at)}
          </div>
        </div>
        <div class="material-type">${material.tipo}</div>
        <a href="/api/materials/${material.filename}/download" class="btn-download" target="_blank">
          Baixar
        </a>
      </li>
    `).join('');

  } catch (error) {
    console.error('Erro ao carregar materiais do usuário:', error);
    document.getElementById('userMaterialsList').innerHTML = '<div class="empty-state"><h3>Erro ao carregar materiais</h3></div>';
  }
}

// Event listeners para fechar modal com ESC
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeModal();
  }
});

// Click fora do modal para fechar
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        closeModal();
      }
    });
  });
});
