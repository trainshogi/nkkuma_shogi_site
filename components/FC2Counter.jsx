import Script from 'next/script';

export default function FC2Counter() {
  return (
    <>
      <Script id="fc2-counter" src="//counter1.fc2.com/counter.php?id=33316434&main=1" strategy="afterInteractive" />
      <noscript>
        <img src="//counter1.fc2.com/counter_img.php?id=33316434&main=1" alt="counter" />
      </noscript>
    </>
  );
}
