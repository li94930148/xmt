/**
 * React Bits 官方组件：StarBorder
 * 官方 Registry：https://reactbits.dev/r/StarBorder-TS-TW.json
 * 接入日期：2026-08-08
 * 原始依赖：无
 * 修改原因：XMT 按钮需要跨浏览器继承统一的主题、尺寸和交互样式。
 * 修改内容：保留星光边框动画，移除固定黑色内层与额外内边距。
 */

import React from 'react';

type StarBorderProps<T extends React.ElementType> = React.ComponentPropsWithoutRef<T> & {
  as?: T;
  className?: string;
  children?: React.ReactNode;
  color?: string;
  speed?: React.CSSProperties['animationDuration'];
  thickness?: number;
};

const StarBorder = <T extends React.ElementType = 'button'>({
  as,
  className = '',
  color = 'white',
  speed = '6s',
  thickness = 1,
  children,
  ...rest
}: StarBorderProps<T>) => {
  const Component = as || 'button';
  const componentProps = rest as React.ComponentPropsWithoutRef<T> & { style?: React.CSSProperties };

  return (
    <Component
      className={`relative overflow-hidden ${className}`}
      {...componentProps}
      style={{ ...componentProps.style }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-11px] right-[-250%] z-0 h-[50%] w-[300%] animate-star-movement-bottom rounded-full opacity-70"
        style={{
          background: `radial-gradient(circle, ${color}, transparent 10%)`,
          animationDuration: speed
        }}
      ></div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[-250%] top-[-10px] z-0 h-[50%] w-[300%] animate-star-movement-top rounded-full opacity-70"
        style={{
          background: `radial-gradient(circle, ${color}, transparent 10%)`,
          animationDuration: speed
        }}
      ></div>
      <span className="pointer-events-none absolute inset-0 rounded-[inherit]" aria-hidden="true" style={{ border: `${thickness}px solid ${color}`, opacity: 0.45 }} />
      <span className="relative z-[1] inline-flex items-center justify-center gap-2">
        {children}
      </span>
    </Component>
  );
};

export default StarBorder;

// tailwind.config.js
// module.exports = {
//   theme: {
//     extend: {
//       animation: {
//         'star-movement-bottom': 'star-movement-bottom linear infinite alternate',
//         'star-movement-top': 'star-movement-top linear infinite alternate',
//       },
//       keyframes: {
//         'star-movement-bottom': {
//           '0%': { transform: 'translate(0%, 0%)', opacity: '1' },
//           '100%': { transform: 'translate(-100%, 0%)', opacity: '0' },
//         },
//         'star-movement-top': {
//           '0%': { transform: 'translate(0%, 0%)', opacity: '1' },
//           '100%': { transform: 'translate(100%, 0%)', opacity: '0' },
//         },
//       },
//     },
//   }
// }
