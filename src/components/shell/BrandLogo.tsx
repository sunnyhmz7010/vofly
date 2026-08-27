// vofly 品牌标识：全站统一使用位图徽标（浅色/深色界面均可辨识）
export function BrandLogo({ className }: { className?: string }) {
  return <img src="/icon-192.png" alt="" aria-hidden="true" className={className} />;
}
