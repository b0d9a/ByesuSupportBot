alter table users
  add column if not exists ui_language_override text
    constraint users_ui_language_override_check check (ui_language_override in ('ru', 'en', 'zh'));
