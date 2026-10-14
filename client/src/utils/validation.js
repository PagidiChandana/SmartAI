export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
}

export function validateRegister({ name, email, password, role }) {
  const errors = {};
  if (!name?.trim()) errors.name = 'Name is required';
  else if (name.trim().length > 80) errors.name = 'Name is too long';
  if (!validateEmail(email)) errors.email = 'Enter a valid email';
  if (!password || password.length < 6) errors.password = 'Password must be at least 6 characters';
  if (!['student', 'educator'].includes(role)) errors.role = 'Choose student or educator';
  return errors;
}

export function validateLogin({ email, password }) {
  const errors = {};
  if (!validateEmail(email)) errors.email = 'Enter a valid email';
  if (!password) errors.password = 'Password is required';
  return errors;
}

export function getApiMessage(err, fallback) {
  const data = err?.response?.data;
  const details = data?.errors?.map((x) => x.message).join(', ');
  return details || data?.message || fallback;
}
