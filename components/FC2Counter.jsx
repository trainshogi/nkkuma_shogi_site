import { useEffect, useRef } from 'react';

export default function FC2Counter() {
  const ref = useRef(null);

  useEffect(() => {
    const s = document.createElement('script');
    s.src = '//counter1.fc2.com/counter.php?id=33316434&main=1';
    s.async = true;
    ref.current.appendChild(s);
  }, []);

  return (
    <div ref={ref}>
      <noscript>
        <img src="//counter1.fc2.com/counter_img.php?id=33316434&main=1" alt="counter" />
      </noscript>
    </div>
  );
}
