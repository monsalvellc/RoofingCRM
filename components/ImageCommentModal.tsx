/**
 * ImageCommentModal — shared modal for adding or editing a 115-character
 * comment on a job image.
 *
 * Two modes:
 *  - 'upload': called after an image is picked, before it is uploaded.
 *              Shows a local URI preview. Confirm fires onUpload(comment).
 *  - 'edit':   called on an existing JobMedia item.
 *              Pre-populates the input with the current comment.
 *              Confirm fires onSave(comment).
 */

import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Button, Typography } from './ui';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../constants/theme';

const MAX_COMMENT = 115;

// ─── Props ─────────────────────────────────────────────────────────────────────

type UploadMode = {
  mode: 'upload';
  /** Local file:// URI from the image picker. */
  uri: string;
  onUpload: (comment: string) => void;
};

type EditMode = {
  mode: 'edit';
  /** Remote download URL of the existing photo. */
  url: string;
  /** The comment currently stored on the photo (may be empty). */
  existingComment: string;
  onSave: (comment: string) => void;
};

type ImageCommentModalProps = (UploadMode | EditMode) & {
  visible: boolean;
  onCancel: () => void;
};

// ─── Component ─────────────────────────────────────────────────────────────────

export function ImageCommentModal(props: ImageCommentModalProps) {
  const { visible, onCancel } = props;

  const [comment, setComment] = useState('');

  // Seed the input whenever the modal opens.
  useEffect(() => {
    if (visible) {
      setComment(props.mode === 'edit' ? props.existingComment : '');
    }
  }, [visible]);  // eslint-disable-line react-hooks/exhaustive-deps

  const imageSource =
    props.mode === 'upload'
      ? { uri: props.uri }
      : { uri: props.url };

  const confirmLabel = props.mode === 'upload' ? 'Upload' : 'Save';

  const handleConfirm = () => {
    if (props.mode === 'upload') {
      props.onUpload(comment.trim());
    } else {
      props.onSave(comment.trim());
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.backdrop} onPress={onCancel} />

        <View style={styles.sheet}>

          {/* ── Header ── */}
          <View style={styles.header}>
            <Typography style={styles.title}>
              {props.mode === 'upload' ? 'Add a Comment' : 'Edit Comment'}
            </Typography>
            <Pressable onPress={onCancel} hitSlop={12}>
              <Typography style={styles.closeBtn}>✕</Typography>
            </Pressable>
          </View>

          {/* ── Image preview ── */}
          <Image
            source={imageSource}
            style={styles.preview}
            contentFit="cover"
            cachePolicy="memory-disk"
          />

          {/* ── Comment input ── */}
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Add a note about this photo..."
              placeholderTextColor={COLORS.textDisabled}
              value={comment}
              onChangeText={(t) => setComment(t.slice(0, MAX_COMMENT))}
              maxLength={MAX_COMMENT}
              multiline
              textAlignVertical="top"
              returnKeyType="default"
            />
            <Typography style={[
              styles.counter,
              comment.length >= MAX_COMMENT && styles.counterAtLimit,
            ]}>
              {comment.length}/{MAX_COMMENT}
            </Typography>
          </View>

          {/* ── Actions ── */}
          <View style={styles.actions}>
            <Button
              variant="outline"
              label="Cancel"
              onPress={onCancel}
              style={styles.cancelBtn}
            />
            <Button
              variant="primary"
              label={confirmLabel}
              onPress={handleConfirm}
              style={styles.confirmBtn}
            />
          </View>

        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },

  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
    paddingTop: SPACING.base,
    gap: SPACING.base,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  closeBtn: {
    fontSize: FONT_SIZE.lg,
    color: COLORS.textSecondary,
  },

  preview: {
    width: '100%',
    height: 200,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.background,
  },

  inputWrapper: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
    minHeight: 90,
  },
  input: {
    fontSize: FONT_SIZE.base,
    color: COLORS.textPrimary,
    lineHeight: 20,
    minHeight: 60,
  },
  counter: {
    fontSize: FONT_SIZE.xs ?? 11,
    color: COLORS.textMuted,
    textAlign: 'right',
    marginTop: SPACING.xs,
  },
  counterAtLimit: {
    color: COLORS.danger,
  },

  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  cancelBtn: {
    flex: 1,
  },
  confirmBtn: {
    flex: 2,
  },
});
