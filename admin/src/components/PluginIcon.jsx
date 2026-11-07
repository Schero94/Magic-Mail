import { EnvelopeIcon } from '@heroicons/react/24/outline';

/** Menu icon. Decorative: the menu link carries the accessible name. */
const PluginIcon = () => (
  <EnvelopeIcon aria-hidden="true" focusable="false" style={{ width: 24, height: 24 }} />
);

export default PluginIcon;
