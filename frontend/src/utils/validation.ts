// Email regex rule for validation
export function isValidEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

//  Password validation rule (minimum 5 characters, >1 uppercase, >1 lowercase, >1 digit)
export function isValidPassword(password: string): boolean {
  return (password.length >= 5 && (password.toUpperCase() !== password) && (password.toLowerCase() !== password) && /\d/.test(password));
}
