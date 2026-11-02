<script setup>
defineProps({kind:{type:String,required:true}});
</script>

<template>
 <svg :viewBox="kind==='hero'?'0 0 240 240':'0 0 144 112'" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <template v-if="kind==='hero'">
   <ellipse cx="124" cy="220" rx="77" ry="7" fill="#272a26" fill-opacity=".06" stroke="none"/>
   <g transform="rotate(-7 109 118)">
    <rect x="48" y="42" width="118" height="151" rx="10" fill="#dfebdd"/>
    <path d="M62 58h84M62 70h65" stroke="#a7bba0"/>
   </g>
   <g transform="rotate(5 130 111)">
    <path d="M77 23h76l35 35v132a8 8 0 0 1-8 8H77a8 8 0 0 1-8-8V31a8 8 0 0 1 8-8Z" fill="#fffdf7"/>
    <path d="M153 23v27a8 8 0 0 0 8 8h27" fill="#edf1e7"/>
    <rect x="87" y="45" width="27" height="7" rx="3.5" fill="#c8d8bf" stroke="none"/>
    <path d="M88 83h79M88 96h67M88 109h76M88 122h46" stroke="#72796c"/>
    <circle cx="130" cy="160" r="20" fill="#e7efdf" stroke="#79916c"/>
    <path d="m120 160 7 7 14-15" stroke="#58734f" stroke-width="2.7"/>
   </g>
   <path d="m168 210 20-44 25 39-45 5Z" fill="#f4d18e"/>
   <path d="m168 210 29-19 16 14M188 166l9 25-2 17"/>
   <path d="m36 155 4 9 10 1-8 7 2 10-8-5-9 5 2-10-8-7 11-1Z" fill="#ded3eb"/>
   <path d="M204 45v12m-6-6h12M29 96h10m-5-5v10" stroke="#8c9c7d"/>
  </template>
  <template v-else-if="kind==='pdf'">
   <ellipse cx="72" cy="101" rx="43" ry="4" fill="#272a26" fill-opacity=".07" stroke="none"/>
   <g transform="rotate(-7 66 58)">
    <rect x="28" y="23" width="62" height="72" rx="5" fill="#eac9b4"/>
    <path d="M44 13h38l19 19v52a5 5 0 0 1-5 5H44a5 5 0 0 1-5-5V18a5 5 0 0 1 5-5Z" fill="#fffaf2"/>
    <path d="M82 13v15a4 4 0 0 0 4 4h15" fill="#f2e4d5"/>
    <rect x="49" y="27" width="20" height="6" rx="3" fill="#d8ad91" stroke="none"/>
    <path d="M50 47h37M50 58h37M50 69h25" stroke="#727366"/>
   </g>
   <circle cx="108" cy="78" r="14" fill="#fffaf2"/>
   <path d="M101 78h14m-5-5 5 5-5 5"/>
  </template>
  <template v-else-if="kind==='video'">
   <ellipse cx="73" cy="101" rx="45" ry="4" fill="#272a26" fill-opacity=".07" stroke="none"/>
   <g transform="rotate(-4 72 54)">
    <rect x="24" y="18" width="96" height="76" rx="8" fill="#cec0e0" stroke="none"/>
    <rect x="20" y="13" width="96" height="76" rx="8" fill="#fffaf2"/>
    <path d="M20 29h96M20 71h96"/>
    <circle cx="29" cy="21" r="1.5" fill="#a38ebd" stroke="none"/>
    <circle cx="36" cy="21" r="1.5" fill="#a38ebd" stroke="none"/>
    <circle cx="43" cy="21" r="1.5" fill="#a38ebd" stroke="none"/>
    <path d="m59 38 21 13-21 13Z" fill="#c4b2da"/>
    <path d="M31 80h53m10 0h10" stroke="#a79ab4"/>
    <circle cx="51" cy="80" r="3" fill="#9b83b6" stroke="none"/>
   </g>
  </template>
  <template v-else-if="kind==='gif'">
   <ellipse cx="72" cy="102" rx="39" ry="4" fill="#272a26" fill-opacity=".07" stroke="none"/>
   <rect x="47" y="29" width="52" height="54" rx="8" fill="#e8d69a" stroke="none"/>
   <rect x="41" y="24" width="52" height="54" rx="8" fill="#fffaf2"/>
   <path d="m61 38 18 13-18 13Z" fill="#e4cc84"/>
   <path d="M29 42a44 44 0 0 1 76-18m0 0V10m0 14H91M111 65a44 44 0 0 1-76 22m0 0v14m0-14h14" stroke-width="2.5"/>
  </template>
  <template v-else-if="kind==='images'">
   <ellipse cx="73" cy="102" rx="45" ry="4" fill="#272a26" fill-opacity=".07" stroke="none"/>
   <g transform="rotate(5 72 55)">
    <rect x="30" y="24" width="91" height="70" rx="6" fill="#b8cdae"/>
    <rect x="22" y="16" width="91" height="70" rx="6" fill="#fffaf2"/>
    <rect x="30" y="24" width="75" height="53" rx="2" fill="#f2f4e9" stroke="#b4bea8" stroke-width="1.3"/>
    <circle cx="86" cy="38" r="7" fill="#f0d18b"/>
    <path d="m30 66 22-23 21 23 12-13 20 24H30Z" fill="#adc5a0"/>
    <path d="m52 43 9 10-6-2-4 4-6-5" stroke="#7c9971" stroke-width="1.3"/>
   </g>
  </template>
 </svg>
</template>
