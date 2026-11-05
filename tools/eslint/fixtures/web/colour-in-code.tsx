// Must fail three times: a palette class, an arbitrary hex class and a style colour (spec "Colours in
// component code"); plus a colour function, a named style colour and a style font family.
export const palette = <div className="bg-blue-500" />;
export const arbitrary = <div className="text-[#DC5F00]" />;
export const styleHex = <div style={{ color: '#000' }} />;
export const fn = 'oklch(0.5 0.1 30)';
export const named = <div style={{ backgroundColor: 'red' }} />;
export const font = <div style={{ fontFamily: 'Arial' }} />;
