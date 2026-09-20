import { defineConfig, defineRecipe } from '@pandacss/dev';

const buttonRecipe = defineRecipe({
  className: 'btn',
  base: {
    position: 'relative',
    overflow: 'hidden',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2',
    fontWeight: 'semibold',
    cursor: 'pointer',
    border: 'none',
    transition: 'background-color 0.3s ease',
    _disabled: { opacity: '0.6', cursor: 'not-allowed' },
    _after: {
      content: '""',
      position: 'absolute',
      top: '50%',
      left: '50%',
      width: '100%',
      paddingBottom: '100%',
      borderRadius: '50%',
      transform: 'translate(-50%, -50%) scale(0)',
      transition: 'transform 0.4s ease',
      pointerEvents: 'none',
    },
    _hover: {
      _after: {
        transform: 'translate(-50%, -50%) scale(2.5)',
      },
    },
  },
  variants: {
    variant: {
      primary: {
        bg: 'blue.600', color: 'white',
        _hover: { bg: 'blue.700' },
        _after: { bg: 'white/20' },
      },
      secondary: {
        bg: 'emerald.600', color: 'white',
        _hover: { bg: 'emerald.700' },
        _after: { bg: 'white/20' },
      },
      danger: {
        bg: 'red.500', color: 'white',
        _hover: { bg: 'red.600' },
        _after: { bg: 'white/20' },
      },
      special: {
        bg: '#3ec6c4', color: 'white',
        _hover: { bg: '#0f8c8c' },
        _after: { bg: 'white/20' },
      },
      ghost: {
        bg: 'transparent', color: 'gray.700',
        _hover: { bg: 'gray.100' },
        _after: { bg: 'black/8' },
        _dark: { color: 'gray.300', _hover: { bg: 'gray.800' } },
      },
      outline: {
        bg: 'white', color: 'gray.800',
        borderWidth: '1px', borderColor: 'gray.300',
        _hover: { bg: 'gray.100' },
        _after: { bg: 'black/6' },
        _dark: { borderColor: 'gray.600', bg: 'gray.800', color: 'gray.100', _hover: { bg: 'gray.700' } },
      },
      link: {
        display: 'inline-block',
        bg: 'var(--colors-background-color)', color: 'var(--colors-text-color)',
        borderWidth: '1px', borderColor: '#3ec6c4',
        _hover: { bg: '#0f8c8c' },
        _after: { bg: 'black/8' },
      },
    },
    size: {
      sm: { px: '2', py: '1', fontSize: 'xs', rounded: 'md' },
      md: { px: '4', py: '2', fontSize: 'sm', rounded: 'md' },
      lg: { px: '6', py: '3', fontSize: 'base', rounded: 'lg' },
    },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});

const iconButtonRecipe = defineRecipe({
  className: 'icon-btn',
  base: {
    position: 'relative',
    overflow: 'hidden',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    border: 'none',
    transition: 'background-color 0.2s ease',
    _after: {
      content: '""',
      position: 'absolute',
      top: '50%',
      left: '50%',
      width: '100%',
      paddingBottom: '100%',
      borderRadius: '50%',
      transform: 'translate(-50%, -50%) scale(0)',
      transition: 'transform 0.4s ease',
      pointerEvents: 'none',
    },
    _hover: {
      _after: {
        transform: 'translate(-50%, -50%) scale(2.5)',
      },
    },
  },
  variants: {
    variant: {
      ghost: {
        bg: 'transparent', color: 'gray.800',
        _hover: { bg: 'gray.100' },
        _after: { bg: 'black/8' },
        _dark: { color: 'gray.100', _hover: { bg: 'gray.800' } },
      },
      dark: {
        bg: 'black/30', color: 'white',
        backdropFilter: 'blur(4px)',
        _hover: { bg: 'black/50' },
        _after: { bg: 'white/15' },
      },
    },
    size: {
      md: { w: '10', h: '10', rounded: 'full' },
      lg: { w: '12', h: '12', rounded: 'full', fontSize: 'xl' },
      xl: { w: '12', h: '12', rounded: 'md', fontSize: '4xl' },
    },
  },
  defaultVariants: { variant: 'ghost', size: 'md' },
});

export default defineConfig({
  preflight: true,
  include: ['./src/app/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}'],
  exclude: [],
  hash: { cssVar: false, className: true },

  theme: {
    extend: {
      recipes: { button: buttonRecipe, iconButton: iconButtonRecipe },
      tokens: {
        colors: {
          'primary-color': { value: '#3b82f6' },
          'primary-hover': { value: '#2563eb' },
          'secondary-color': { value: '#10b981' },
          'secondary-hover': { value: '#059669' },
          'danger-color': { value: '#ef4444' },
          'danger-hover': { value: '#dc2626' },
          special: { value: '#3ec6c4' },
          'special-hover': { value: '#0f8c8c' },
          'yojo-deck-text-color': { value: '#800000' },
          'sweet-deck-text-color': { value: '#008080' },
          'playable-deck-text-color': { value: '#000080' },
        },
        radii: { 'border-radius': { value: '0.5rem' } },
      },
      semanticTokens: {
        colors: {
          'background-color': { value: { base: '#f3f4f6', _dark: '#1f2937' } },
          'hover-back-color': { value: { base: '#9e9e9e', _dark: '#6e6e6e' } },
          'hover-back-color-light': { value: { base: '#e2e2e2', _dark: '#9e9e9e' } },
          'card-background': { value: { base: '#ffffff', _dark: '#374151' } },
          'text-color': { value: { base: '#1f2937', _dark: '#f3f4f6' } },
          'text-light': { value: { base: '#6b7280', _dark: '#9ca3af' } },
          'background-light': { value: { base: 'transparent', _dark: '#1f2937' } },
          'revers-background-color': { value: { base: '#1f2937', _dark: '#f3f4f6' } },
          'revers-text-color': { value: { base: '#f3f4f6', _dark: '#1f2937' } },
          'deck-background-color': { value: { base: '#c3c3c3', _dark: '#515151' } },
          'deck-text-color': { value: { base: '#1f2937', _dark: '#dddddd' } },
          'yojo-deck-background-color': { value: { base: '#f8d9d9', _dark: '#e09898' } },
          'yojo-deck-border-color': { value: { base: '#e0b0b0', _dark: '#c09090' } },
          'sweet-deck-background-color': { value: { base: '#d9f6f8', _dark: '#98b7e0' } },
          'sweet-deck-border-color': { value: { base: '#90e0e0', _dark: '#9090c0' } },
          'playable-deck-background-color': { value: { base: '#d9d9f8', _dark: '#9898e0' } },
          'playable-deck-border-color': { value: { base: '#9090e0', _dark: '#9090c0' } },
        },
        shadows: {
          shadow: {
            value: {
              base: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              _dark: '0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.4)',
            },
          },
        },
      },
    },
  },
  outdir: 'styled-system',
});
