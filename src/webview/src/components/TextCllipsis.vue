<script setup lang="ts">
import { ref } from 'vue';
import { Popup as TPopup } from 'tdesign-vue-next';

/**
 * 长文本弹出显示 - 组件属性
 */
defineProps<{
  /**
   * 文本
   */
  text: string;
}>();

/**
 * 弹出层是否显示
 */
const isPopupVisible = ref(false);

/**
 * 处理鼠标进入事件，显示弹出层
 */
function showPopup(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (target.scrollWidth > target.clientWidth) {
    isPopupVisible.value = true;
  }
}

/**
 * 处理鼠标离开事件，隐藏弹出层
 */
function hidePopup() {
  isPopupVisible.value = false;
}
</script>

<template>
  <div @mouseenter="showPopup" @mouseleave="hidePopup">
    <TPopup :visible="isPopupVisible" :content="text" hide-empty-popup> {{ text }} </TPopup>
  </div>
</template>
