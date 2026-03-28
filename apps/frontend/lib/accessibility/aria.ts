export const ariaLabels = {
  close: 'Close',
  open: 'Open',
  menu: 'Menu',
  settings: 'Settings',
  notifications: 'Notifications',
  userMenu: 'User menu',
  logout: 'Logout',
  search: 'Search',
  filter: 'Filter',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  save: 'Save',
  cancel: 'Cancel',
  submit: 'Submit',
  loading: 'Loading',
  error: 'Error',
  success: 'Success',
  previous: 'Previous',
  next: 'Next',
  back: 'Back',
  forward: 'Forward',
} as const;

export function getAriaLabel(key: keyof typeof ariaLabels): string {
  return ariaLabels[key];
}
