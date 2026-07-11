import { useEffect, useRef } from 'react';
import pluginId from '../pluginId';

/**
 * Initializer component that marks the plugin as ready.
 */
const Initializer = ({ setPlugin }) => {
  const ref = useRef(setPlugin);

  useEffect(() => {
    ref.current(pluginId);
  }, []);

  return null;
};

export default Initializer;
