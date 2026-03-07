import { createTheme, type MantineColorsTuple } from '@mantine/core';

const brandScale: MantineColorsTuple = [
  'var(--color-brand-50)',
  'var(--color-brand-100)',
  'var(--color-brand-200)',
  'var(--color-brand-300)',
  'var(--color-brand-400)',
  'var(--color-brand-500)',
  'var(--color-brand-600)',
  'var(--color-brand-700)',
  'var(--color-brand-800)',
  'var(--color-brand-900)'
];

const grayScale: MantineColorsTuple = [
  'var(--color-gray-50)',
  'var(--color-gray-100)',
  'var(--color-gray-200)',
  'var(--color-gray-300)',
  'var(--color-gray-400)',
  'var(--color-gray-500)',
  'var(--color-gray-600)',
  'var(--color-gray-700)',
  'var(--color-gray-800)',
  'var(--color-gray-900)'
];

export const appTheme = createTheme({
  primaryColor: 'brand',
  colors: {
    brand: brandScale,
    gray: grayScale
  },
  fontFamily: 'var(--font-ui)',
  headings: { fontFamily: 'var(--font-ui)' },
  defaultRadius: 'md',
  components: {
    Button: {
      defaultProps: {
        radius: 'xl'
      }
    },
    Card: {
      defaultProps: {
        radius: 'xl'
      }
    },
    TextInput: {
      defaultProps: {
        radius: 'md'
      }
    },
    Select: {
      defaultProps: {
        radius: 'md'
      }
    },
    Textarea: {
      defaultProps: {
        radius: 'md'
      }
    }
  }
});
