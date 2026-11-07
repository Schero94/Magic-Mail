import { useEffect, useRef } from 'react';
import pluginId from '../pluginId';

/**
 * Marks the plugin as ready once the admin has mounted it.
 * @param {{setPlugin?: (id: string) => void}} props
 */
const Initializer = ({ setPlugin }) => {
  const ref = useRef(setPlugin);

  useEffect(() => {
    if (typeof ref.current === 'function') ref.current(pluginId);
  }, []);

  return null;
};

export default Initializer;
